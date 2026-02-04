import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const devCerts = () => {
  try {
    return {
      key: readFileSync(resolve(__dirname, '.cert/localhost-key.pem')),
      cert: readFileSync(resolve(__dirname, '.cert/localhost.pem')),
    };
  } catch {
    console.warn('Dev certificates not found. Run: pnpm setup:certs');
    return undefined;
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    https: devCerts(),
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        taskpane: resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
