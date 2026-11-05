import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: the React app runs on :5173 and forwards /api to the Node server on :3001.
// Prod: `npm run build` writes client/dist, which the Node server serves itself.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
