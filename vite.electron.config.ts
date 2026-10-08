import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist-electron',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'electron/main.ts',
        preload: 'electron/preload.ts',
      },
      external: ['electron', 'sharp', /^node:/, /^@img\//],
      output: {
        format: 'cjs',
        entryFileNames: '[name].cjs',
      },
    },
  },
});
