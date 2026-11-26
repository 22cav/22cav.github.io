// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
  site: 'https://22cav.github.io',
  integrations: [mdx(), sitemap()],
  markdown: {
    // Quotes, dashes and ellipses set properly, without having to think about it.
    smartypants: true,
    // LaTeX: $inline$ and $$display$$ math, rendered to HTML at build time (no client JS).
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    // Code colours follow the site's light/dark mode (see global.css).
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
