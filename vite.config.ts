import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Local-only app: one large three.js chunk is fine.
  build: { chunkSizeWarningLimit: 2000 },
});
