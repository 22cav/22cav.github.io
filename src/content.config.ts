import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/index.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    /** One plain sentence: what the project is. Shown in every list. */
    summary: z.string(),
    /** The main result, in a few words. Shown under the summary. */
    result: z.string().optional(),
    /** Where it was done: a course, a lab, a hackathon, or "Personal project". */
    context: z.string(),
    date: z.coerce.date(),
    code: z.string().url().optional(),
    /** Position in the projects list (1 = first). Projects without it come after, newest first. */
    order: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, blog };
