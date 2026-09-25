import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_DESCRIPTION, APP_NAME, THEME_COLOR } from './src/lib/config/app.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

/** Replaces %APP_NAME% / %APP_DESCRIPTION% / %THEME_COLOR% in index.html. */
function htmlConstants(): Plugin {
  return {
    name: 'recto-html-constants',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%APP_NAME%', APP_NAME)
        .replaceAll('%APP_DESCRIPTION%', APP_DESCRIPTION)
        .replaceAll('%THEME_COLOR%', THEME_COLOR),
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  resolve: { alias: { $lib: '/src/lib' } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    svelte(),
    htmlConstants(),
    VitePWA({
      // Never 'autoUpdate': it would reload the page in the middle of a review session.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        lang: 'fr',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        background_color: '#ffffff',
        theme_color: THEME_COLOR,
        description: APP_DESCRIPTION,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'],
        // sql.js (and fsrs-browser in V1) ship large .wasm files that must work offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
})
