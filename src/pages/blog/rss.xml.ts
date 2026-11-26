import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { posts } from '../../lib/content';

export async function GET(context: APIContext) {
  return rss({
    title: 'Matteo Caviglia: blog',
    description: 'Notes on machine learning, signals and research.',
    site: context.site!,
    items: (await posts()).map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
    })),
  });
}
