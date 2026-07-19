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
    carousel: z.boolean().optional().default(false),
    gallery: z.array(imageItem).optional().default([]),
    videos: z.array(videoItem).optional().default([]),
    /** Áudio próprio (MP3 etc.) — loop + fade-in; tem prioridade sobre Spotify */
    audio_file: z.string().optional(),
    spotify_url: z.union([z.string().url(), z.literal('')]).optional(),
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

const moments = defineCollection({
  loader: glob({ base: './src/content/moments', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    date: z.coerce.date(),
    image: z.string(),
    text: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
  }),
});

export const collections = { publicacoes, eventos, moments };
