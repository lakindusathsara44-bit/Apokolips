import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'plans-app',
  base: './',
  build: {
    outDir: '../assets/plans',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        entryFileNames: 'plans.js',
        chunkFileNames: 'chunk-[name].js',
        assetFileNames: (asset) => asset.name?.endsWith('.css') ? 'plans.css' : '[name][extname]'
      }
    }
  }
});