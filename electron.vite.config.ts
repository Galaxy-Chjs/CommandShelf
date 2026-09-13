import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared },
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
        external: ['node:sqlite'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared },
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': shared,
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      // electron-vite leaves the renderer unminified by default; the two
      // renderer entry points are parsed on every window creation, so they are
      // worth compressing. The main and preload bundles stay readable, which is
      // where a user-reported stack trace would actually matter.
      minify: 'esbuild',
      cssMinify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          panel: resolve('src/renderer/panel.html'),
        },
      },
    },
  },
})
