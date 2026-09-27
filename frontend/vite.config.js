import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
      registerType: 'autoUpdate',
      includeAssets: ['pks-logo.svg', 'manifest.json'],
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
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Emoji data is lazy-loaded by the editor's emoji picker; skip it.
        globIgnores: ['**/native-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'gstatic-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
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
