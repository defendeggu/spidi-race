import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8090', ws: true },
      '/api': { target: 'http://localhost:8090' },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
