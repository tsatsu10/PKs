/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Vercel sets VERCEL_GIT_COMMIT_SHA at build time; local and test builds report "dev".
    __APP_VERSION__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12)),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vite's preload helper must not live in a lazy vendor chunk, or every
          // page that lazy-loads anything imports that chunk.
          if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) return 'vite-runtime';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react-vendor';
          if (id.includes('node_modules/@supabase/')) return 'supabase';
          if (id.includes('node_modules/@mantine/hooks')) return 'mantine-hooks';
          if (
            id.includes('node_modules/@blocknote/')
            || id.includes('node_modules/@tiptap/')
            || id.includes('node_modules/prosemirror')
            || id.includes('node_modules/@mantine/core')
          ) return 'blocknote';
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['pks-logo.svg'],
      manifest: {
        name: 'PKS — Personal Knowledge System',
        short_name: 'PKS',
        description: 'Your second brain. Capture, organize, and synthesize knowledge.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0f',
        theme_color: '#ec4899',
        orientation: 'portrait-primary',
        icons: [
          { src: '/pks-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Emoji data is lazy-loaded by the editor's emoji picker; skip it.
        globIgnores: ['**/native-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
  server: {
    port: 5173,
  },
})
