import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/readme.md': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/package.json': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
