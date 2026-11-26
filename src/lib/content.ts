import { getCollection } from 'astro:content';
import Figure from '../components/Figure.astro';
import BarTable from '../components/BarTable.astro';

// Drafts show up in `npm run dev` and are left out of the built site.
const visible = ({ data }: { data: { draft: boolean } }) => import.meta.env.DEV || !data.draft;

async function newest<C extends 'projects' | 'blog'>(name: C) {
  return (await getCollection(name, visible)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );
}

// Hand-picked order first (the `order` field), then the rest newest first.
export const projects = async () =>
  (await newest('projects')).sort(
    (a, b) => (a.data.order ?? Infinity) - (b.data.order ?? Infinity),
  );
export const posts = () => newest('blog');

/** Components available inside every .mdx project page and post. */
export const mdxComponents = { Figure, BarTable };

/** "25 Nov 2026" for display, plus the machine-readable form for <time>. */
export const formatDate = (date: Date) => ({
  when: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  datetime: date.toISOString().slice(0, 10),
});
