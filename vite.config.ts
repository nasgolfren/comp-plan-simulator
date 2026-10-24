import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves the site from /<repo-name>/
export default defineConfig({
  base: '/comp-plan-simulator/',
  plugins: [tailwindcss()],
});
