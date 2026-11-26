// A speech-like waveform, generated at build time.
//
// Speech comes in syllables grouped into short phrases. Each bar is the loudness
// of one frame: a sum of syllable bursts with some jitter. The end fades out, so
// the waveform trails off into silence. Seeded, so it is the same on every build.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Bar heights in [0, 1], one per frame, fading to silence at the end. */
export function speechEnvelope(bars: number, seed: number) {
  const rand = mulberry32(seed);

  const syllables: { at: number; width: number; amp: number }[] = [];
  let x = 1 + rand() * 2;
  while (x < bars) {
    const inPhrase = 2 + Math.floor(rand() * 4);
    for (let s = 0; s < inPhrase && x < bars; s++) {
      syllables.push({ at: x, width: 1 + rand() * 1.2, amp: 0.4 + rand() * 0.6 });
      x += 3 + rand() * 3;
    }
    x += 3 + rand() * 4; // pause between phrases
  }

  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    let e = 0;
    for (const s of syllables) {
      const d = (i - s.at) / s.width;
      e += s.amp * Math.exp(-0.5 * d * d);
    }
    e *= 0.75 + 0.25 * rand();
    // Trail off over the last 45%: full volume, then down to nothing.
    const t = Math.min(1, Math.max(0, (bars - 1 - i) / (bars * 0.45)));
    e *= t * t * (3 - 2 * t);
    out.push(Math.min(1, e));
  }
  return out;
}
