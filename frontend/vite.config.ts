import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin calls in dev -> no CORS setup needed on the backend.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
