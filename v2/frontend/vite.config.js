import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The FastAPI backend serves /api (and, after `npm run build`, this app from dist/).
// In development, Vite proxies /api to it, including the /api/stream event stream.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 900 },
});
