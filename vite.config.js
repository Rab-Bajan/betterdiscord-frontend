import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const certDir = path.resolve(__dirname, '../certs');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

const httpsOptions = fs.existsSync(keyPath) && fs.existsSync(certPath)
  ? {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    open: false,
    https: httpsOptions,
    proxy: {
      '/socket.io': {
        target: 'https://localhost:5000',
        ws: true,
        secure: false,
        changeOrigin: true
      },
      '/api': {
        target: 'https://localhost:5000',
        secure: false,
        changeOrigin: true
      },
      '/casino': {
        target: 'https://localhost:5000',
        secure: false,
        changeOrigin: true
      },
      '/uploads': {
        target: 'https://localhost:5000',
        secure: false,
        changeOrigin: true
      }
    }
  }
});
