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
    // Keep generated files isolated from the repository source tree.
    outDir: resolve(repoRoot, 'assets/info'),
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      // Build the React entry directly. info.html is a static shell and
      // references the generated bundle, so it must not be a Vite input.
      input: resolve(repoRoot, 'info-app/src/main.jsx'),
      output: {
        entryFileNames: 'info.js',
        chunkFileNames: 'chunk-[name].js',
        assetFileNames: (asset) => asset.name?.endsWith('.css')
          ? 'info.css'
          : '[name]-[hash][extname]'
      }
    }
  }
});
