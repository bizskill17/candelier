import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build output goes to dist/. Upload the contents of dist/ to public_html on Hostinger.
// During development, /api calls are forwarded to your local PHP server.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
    },
  },
});
