import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// El workflow de GitHub Actions inyecta BASE_PATH con el nombre del repo,
// para no tener que tocar este fichero si el repo se llama de otra forma.
const base = process.env.BASE_PATH ?? '/nutrirub/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.woff2', 'icons/*.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'NutriRub',
        short_name: 'NutriRub',
        description: 'Seguimiento de macros. Local, sin cuentas.',
        lang: 'es',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#10120F',
        theme_color: '#10120F',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        navigateFallback: base + 'index.html',
        cleanupOutdatedCaches: true,
        // Nada de red en el shell: la app tiene que arrancar sin cobertura.
        runtimeCaching: [],
      },
    }),
  ],
})
