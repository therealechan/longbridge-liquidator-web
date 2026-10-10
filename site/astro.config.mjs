import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://liquidator.nowornever.work',
  output: 'static',
  integrations: [tailwind()],
});
