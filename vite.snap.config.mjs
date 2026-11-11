import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: '/opt/better-dc/betterdiscord-frontend',
  plugins: [react()],
  build: { outDir: '/tmp/claude-0/-opt-better-dc/8492d40a-4d8b-41ef-b619-481cac97344b/scratchpad/snap', emptyOutDir: true, rollupOptions: { input: '/opt/better-dc/betterdiscord-frontend/phobia-test.html' } },
  preview: { port: 3066 }
});
