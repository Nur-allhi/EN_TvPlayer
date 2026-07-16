import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  root: '.',
  plugins: [basicSsl()],
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    target: 'es2015',
    rollupOptions: {
      output: {
        manualChunks: {
          shaka: ['shaka-player'],
        },
      },
    },
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    https: true,
    proxy: {
      '/proxy': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace('/proxy', ''), // /proxy/https://... -> /https://...
      },
      '/log': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5000,
    host: '0.0.0.0',
    https: true,
    proxy: {
      '/proxy': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace('/proxy', ''),
      },
      '/log': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
