import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { forgeDeckPwa } from './vite/pwaPlugin.ts';

// Relative base './' keeps dist/ portable across /, /<subpath>/, and local preview.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), forgeDeckPwa()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    include: ['src/test/**/*.test.ts'],
  },
});
