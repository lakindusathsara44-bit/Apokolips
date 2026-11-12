import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: repoRoot,
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: repoRoot,
    emptyOutDir: false,
    copyPublicDir: false,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(repoRoot, 'info.html'),
      output: {
        entryFileNames: 'assets/info/info.js',
        chunkFileNames: 'assets/info/chunk-[name].js',
        assetFileNames: (asset) => asset.name?.endsWith('.css')
          ? 'assets/info/info.css'
          : 'assets/info/[name]-[hash][extname]'
      }
    }
  }
});
