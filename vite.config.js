import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version is picked up automatically the next time the app is opened
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['app-icon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'LynxOS',
        short_name: 'LynxOS',
        description: 'LynxOS: your personal money tracker',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#f4f7fd',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app itself is stored on the phone; launch screens are only needed by iOS at install time
        globPatterns: ['**/*.{js,css,html}', 'icons/*.png', 'app-icon.png', 'logo.png', 'logo-white.png'],
        navigateFallback: '/index.html',
        // Payment reminders: show pushed notifications (public/push-sw.js)
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Shop logos (src/lib/merchants.js): kept on the phone for a month so they show offline
          {
            urlPattern: /^https:\/\/www\.google\.com\/s2\/favicons.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'shop-logos',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Investment logos from getquin (src/screens/Investments.jsx), kept like the shop logos
          {
            urlPattern: /^https:\/\/static\.getquin\.com\/logos.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'investment-logos',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase (your data) is never cached: it always comes fresh from the server
        ],
      },
    }),
  ],
})
