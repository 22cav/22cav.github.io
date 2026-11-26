#!/usr/bin/env node
/**
 * driver.mjs — build, serve and drive the 22cav site headlessly.
 *
 * Zero dependencies. Talks the Chrome DevTools Protocol over node's built-in
 * WebSocket (node >= 22) to a Chrome binary already on the machine, and starts
 * the Astro server itself so a caller only ever runs one command.
 *
 * Agent tooling, not product code — it is allowed to be blunt.
 */

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL_DIR, '../../..'); // <unit>/
const SHOTS = path.join(SKILL_DIR, 'shots');

// ─── args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const cmd = argv.shift();
const flags = {};
const positional = [];
for (const a of argv) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (m) flags[m[1]] = m[2] ?? true;
  else positional.push(a);
}
const flag = (name, dflt) => (name in flags ? flags[name] : dflt);
const log = (...a) => console.error(...a);

// ─── chrome ──────────────────────────────────────────────────────────────────

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const globs = [
    // Playwright's browser cache — the one that exists on this machine.
    `${os.homedir()}/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    `${os.homedir()}/Library/Caches/ms-playwright/chromium-*/chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    `${os.homedir()}/.cache/ms-playwright/chromium-*/chrome-linux/chrome`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const g of globs) {
    if (!g.includes('*')) {
      if (fs.existsSync(g)) return g;
      continue;
    }
    const [head, tail] = g.split('*');
    const dir = path.dirname(head);
    const prefix = path.basename(head);
    let entries = [];
    try {
      entries = fs.readdirSync(dir).filter((e) => e.startsWith(prefix)).sort().reverse();
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e) + tail;
      if (fs.existsSync(p)) return p;
    }
  }
  for (const bin of ['chromium', 'google-chrome', 'chromium-browser']) {
    const r = spawnSync('which', [bin], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.trim();
  }
  throw new Error(
    'No Chrome found. Set CHROME_BIN, or run: npx playwright install chromium'
  );
}

// ─── small utils ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status < 500) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${url}`);
}

// ─── CDP ─────────────────────────────────────────────────────────────────────

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(`${msg.error.message} (${p.method})`)) : p.resolve(msg.result);
      } else {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('CDP socket failed')), { once: true });
    });
    return new CDP(ws);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  once(method, { sessionId, timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        off();
        reject(new Error(`timed out waiting for ${method}`));
      }, timeout);
      const off = this.on((msg) => {
        if (msg.method !== method) return;
        if (sessionId && msg.sessionId !== sessionId) return;
        clearTimeout(t);
        off();
        resolve(msg.params);
      });
    });
  }
}

// ─── the site under test ─────────────────────────────────────────────────────

class Site {
  constructor({ dev = false, build = true } = {}) {
    this.dev = dev;
    this.build = build;
    this.procs = [];
  }

  async start() {
    if (!this.dev && this.build) {
      log('· astro build');
      const r = spawnSync('node_modules/.bin/astro', ['build'], { cwd: ROOT, encoding: 'utf8' });
      if (r.status !== 0) {
        process.stderr.write(r.stdout ?? '');
        process.stderr.write(r.stderr ?? '');
        throw new Error('astro build failed');
      }
    }

    this.port = await freePort();
    const sub = this.dev ? 'dev' : 'preview';
    log(`· astro ${sub} on :${this.port}`);
    const proc = spawn(
      'node_modules/.bin/astro',
      [sub, '--port', String(this.port), '--host', '127.0.0.1'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    this.procs.push(proc);
    this.serverLog = '';
    for (const s of [proc.stdout, proc.stderr]) s.on('data', (d) => (this.serverLog += d));
    this.origin = `http://127.0.0.1:${this.port}`;
    try {
      await waitForHttp(this.origin + '/');
    } catch (e) {
      log(this.serverLog);
      throw e;
    }

    // Chrome
    const chrome = findChrome();
    log(`· chrome ${path.basename(chrome)}`);
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), '22website-chrome-'));
    const cdpPort = await freePort();
    const cproc = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--force-color-profile=srgb',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${this.profile}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    this.procs.push(cproc);
    this.chromeLog = '';
    cproc.stderr.on('data', (d) => (this.chromeLog += d));

    await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`, 20000);
    const version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
    this.browser = await CDP.connect(version.webSocketDebuggerUrl);

    const { targetId } = await this.browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.browser.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    this.sid = sessionId;

    await this.cmd('Page.enable');
    await this.cmd('Runtime.enable');
    await this.cmd('Network.enable');

    // Everything the page complained about, per navigation.
    this.problems = [];
    this.browser.on((msg) => {
      if (msg.sessionId !== this.sid) return;
      const p = msg.params;
      if (msg.method === 'Runtime.consoleAPICalled' && p.type === 'error')
        this.problems.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
      if (msg.method === 'Runtime.exceptionThrown')
        this.problems.push(`exception: ${p.exceptionDetails.text} ${p.exceptionDetails.exception?.description ?? ''}`);
      if (msg.method === 'Network.responseReceived' && p.response.status >= 400)
        this.problems.push(`HTTP ${p.response.status} ${p.response.url}`);
      if (msg.method === 'Network.loadingFailed' && !p.canceled)
        this.problems.push(`request failed: ${p.errorText}`);
    });
  }

  cmd(method, params) {
    return this.browser.send(method, params, this.sid);
  }

  async viewport(width, height = 900) {
    await this.cmd('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
  }

  async reducedMotion(on) {
    await this.cmd('Emulation.setEmulatedMedia', {
      features: on ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
    });
  }

  async goto(p) {
    this.problems = [];
    const url = p.startsWith('http') ? p : this.origin + p;
    const loaded = this.browser.once('Page.loadEventFired', { sessionId: this.sid });
    await this.cmd('Page.navigate', { url });
    await loaded;
    await this.settle();
    return this.eval('location.pathname'); // post-redirect: /works → /works/
  }

  /** Two rAFs + a beat: enough for fonts to swap and view() timelines to apply. */
  async settle() {
    await this.eval(
      `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))).then(() => document.fonts.ready)`,
      true
    );
    await sleep(120);
  }

  async eval(expression, awaitPromise = false) {
    const r = await this.cmd('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  }

  async scrollTo(y) {
    await this.eval(`window.scrollTo(0, ${Number(y)})`);
    await this.settle();
  }

  async shot(file, { full = false } = {}) {
    const { data } = await this.cmd('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: full,
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  /** Same-origin links on the current page, as pathnames. */
  links() {
    return this.eval(
      `[...new Set([...document.querySelectorAll('a[href]')]
         .map(a => a.href)
         .filter(h => h.startsWith(location.origin))
         .map(h => new URL(h).pathname))]`
    );
  }

  async stop() {
    for (const p of this.procs) {
      try {
        p.kill('SIGTERM');
      } catch {}
    }
    await sleep(150);
    for (const p of this.procs) {
      try {
        p.kill('SIGKILL');
      } catch {}
    }
    if (this.profile) fs.rmSync(this.profile, { recursive: true, force: true });
  }
}

const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '-'));

/** Breadth-first crawl from `/`, so drafts in --dev mode get picked up too. */
async function crawl(site, problems) {
  const seen = new Set();
  const queue = ['/'];
  const order = [];
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    // Astro's preview server 301s /works → /works/; dedupe on where we landed.
    const landed = await site.goto(p);
    if (landed !== p && seen.has(landed)) continue;
    seen.add(landed);
    order.push(landed);
    if (problems) for (const x of site.problems) problems.push(`${landed}: ${x}`);
    for (const l of await site.links()) if (!seen.has(l)) queue.push(l);
  }
  return order;
}

// ─── commands ────────────────────────────────────────────────────────────────

const WIDTHS = { desktop: 1440, mobile: 390 };

async function main() {
  const site = new Site({ dev: !!flag('dev', false), build: flag('build', true) !== 'false' });
  let code = 0;
  try {
    await site.start();

    if (cmd === 'audit') {
      const problems = [];
      const routes = await crawl(site, problems);
      console.log(`routes reached from / (${routes.length}):`);
      for (const r of routes) console.log('  ' + r);

      // A 404 page is expected to be reachable only by asking for junk.
      await site.goto('/definitely-not-a-page');
      const notFound = await site.eval('document.title');
      console.log(`\n404 handling: ${notFound}`);

      if (problems.length) {
        console.log('\nPROBLEMS:');
        for (const p of problems) console.log('  ' + p);
        code = 1;
      } else {
        console.log('\nno console errors, exceptions, or failed requests.');
      }
    } else if (cmd === 'shots') {
      const routes = positional.length ? positional : await crawl(site, null);
      const scroll = Number(flag('scroll', 0));
      const full = !!flag('full', false);
      if (flag('reduce-motion', false)) await site.reducedMotion(true);
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const [name, w] of Object.entries(WIDTHS)) {
        if (flag('width') && String(w) !== String(flag('width'))) continue;
        await site.viewport(w);
        for (const r of routes) {
          await site.goto(r);
          if (scroll) await site.scrollTo(scroll);
          const f = path.join(SHOTS, `${slug(r)}-${name}${scroll ? `-y${scroll}` : ''}.png`);
          await site.shot(f, { full });
          console.log(path.relative(ROOT, f));
        }
      }
    } else if (cmd === 'shot') {
      const route = positional[0] ?? '/';
      const w = Number(flag('width', 1440));
      const scroll = Number(flag('scroll', 0));
      if (flag('reduce-motion', false)) await site.reducedMotion(true);
      await site.viewport(w);
      await site.goto(route);
      if (scroll) await site.scrollTo(scroll);
      const out = flag('out')
        ? path.resolve(ROOT, flag('out'))
        : path.join(SHOTS, `${slug(route)}-${w}${scroll ? `-y${scroll}` : ''}.png`);
      await site.shot(out, { full: !!flag('full', false) });
      console.log(path.relative(ROOT, out));
      for (const p of site.problems) console.log('problem: ' + p);
    } else if (cmd === 'eval') {
      const route = positional[0] ?? '/';
      const expr = positional.slice(1).join(' ');
      if (!expr) throw new Error('usage: eval <route> <javascript>');
      await site.viewport(Number(flag('width', 1440)));
      await site.goto(route);
      if (flag('scroll')) await site.scrollTo(Number(flag('scroll')));
      console.log(JSON.stringify(await site.eval(expr), null, 2));
    } else if (cmd === 'html') {
      const route = positional[0] ?? '/';
      await site.goto(route);
      console.log(await site.eval('document.documentElement.outerHTML'));
    } else if (cmd === 'serve') {
      console.log(site.origin);
      log('· ctrl-c to stop');
      await new Promise(() => {});
    } else {
      console.log(`usage: node .claude/skills/run-22website/driver.mjs <command> [--dev] [--no-build]

  audit                     crawl every route, report console errors / bad requests
  shots [routes...]         screenshot routes at 1440 and 390 wide
  shot <route>              one screenshot  [--width= --scroll= --full --out=]
  eval <route> <js>         run javascript in the page, print the JSON result
  html <route>              dump the rendered DOM
  serve                     just run the server and print its URL

  --dev                     use \`astro dev\` (drafts visible) instead of the built site
  --no-build                skip \`astro build\` and serve whatever is in dist/
  --reduce-motion           emulate prefers-reduced-motion: reduce
  --scroll=N                scroll to y=N before shooting

screenshots land in .claude/skills/run-22website/shots/`);
      code = 2;
    }
  } finally {
    await site.stop();
  }
  process.exit(code);
}

main().catch((e) => {
  console.error('FAILED: ' + (e?.stack ?? e));
  process.exit(1);
});
