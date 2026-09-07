import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['icon-192x192.png', 'icon-512x512.png', 'apple-touch-icon.png', 'logo.png', 'favicon.png'],
      manifest: {
        name: 'MoneySuivi',
        short_name: 'MoneySuivi',
        description: 'One finance ecosystem for budgets, expenses, EMIs, net worth and notifications',
        id: '/',
        theme_color: '#0EA5E9',
        background_color: '#0f172a',
        display: 'standalone',
        display_override: ['standalone', 'window-controls-overlay'],
        dir: 'ltr',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        prefer_related_applications: true,
        related_applications: [
          {
            platform: 'play',
            url: 'https://play.google.com/store/apps/details?id=com.onrender.smartexpencetracker_frontend.twa',
            id: 'com.onrender.smartexpencetracker_frontend.twa'
          }
        ],
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        categories: ['finance', 'utilities'],
        screenshots: [
          {
            src: '/screenshot-mobile.png',
            sizes: '1920x912',
            type: 'image/png',
            form_factor: 'wide',
            label: 'MoneySuivi Dashboard'
          },
          {
            src: '/screenshot-narrow.png',
            sizes: '500x750',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'MoneySuivi Mobile Login'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
})
