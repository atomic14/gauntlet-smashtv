import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // a port of its own: other projects here hold 5173 and up
  server: { host: true, port: 5240 },
  preview: { port: 5240 },
  // public/assets holds the extracted game data, so keep Vite's own output separate
  build: { assetsDir: 'build' },
});
