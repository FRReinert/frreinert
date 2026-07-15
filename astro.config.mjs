// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';
import { shouldExcludeFromSitemap } from './src/lib/site/seo.ts';

// https://astro.build/config
export default defineConfig({
  site: 'https://frreinert.com.br',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname;
        return !shouldExcludeFromSitemap(pathname);
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
