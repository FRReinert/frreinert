import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const imageItem = z.union([
  z.string(),
  z.object({ image: z.string() }).transform((v) => v.image),
]);

const videoItem = z.union([
  z.string(),
  z.object({ url: z.string() }).transform((v) => v.url),
]);

const publicacoes = defineCollection({
  loader: glob({ base: './src/content/publicacoes', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    cover: z.string(),
    gallery: z.array(imageItem).optional().default([]),
    videos: z.array(videoItem).optional().default([]),
  }),
});

const eventPhoto = z.object({
  id: z.string(),
  title: z.string().optional(),
  preview: z.string(),
  price: z.coerce.number().nonnegative(),
  highresKey: z.string().optional(),
});

const eventos = defineCollection({
  loader: glob({ base: './src/content/eventos', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    cover: z.string(),
    location: z.string().optional(),
    photos: z.array(eventPhoto).optional().default([]),
  }),
});

export const collections = { publicacoes, eventos };
