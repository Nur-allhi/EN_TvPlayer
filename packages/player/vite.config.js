import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  base: '',
  resolve: {
    alias: {
      '@root': path.resolve(__dirname, '..', '..'),
    },
  },
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
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
});
