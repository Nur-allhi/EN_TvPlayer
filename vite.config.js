import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    target: 'es2015',
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
      },
    },
  },
  plugins: [
    basicSsl(),
    {
      name: 'tizen-html-transform',
      closeBundle() {
        const html = fs.readFileSync(path.resolve(__dirname, 'dist/index.html'), 'utf-8');
        const fixed = html
          .replace(/\s+type="module"/g, '')
          .replace(/\s+crossorigin/g, '');
        fs.writeFileSync(path.resolve(__dirname, 'dist/index.html'), fixed);
      },
    },
  ],
  server: {
    port: 5000,
    host: '0.0.0.0',
    https: true,
    proxy: {
      '/proxy': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace('/proxy', ''),
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
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
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/log': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});