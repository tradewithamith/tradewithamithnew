import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function safeViteClientPlugin(): Plugin {
  return {
    name: 'safe-vite-client-ws',
    enforce: 'post',
    transform(code, id) {
      if (id.includes('vite/dist/client/client.mjs')) {
        if (process.env.DISABLE_HMR === 'true') {
          return code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR disabled in Cloud Run preview */'
          );
        }
        return code.replace(
          'transport.connect(createHMRHandler(handleMessage));',
          'transport.connect(createHMRHandler(handleMessage)).catch(() => {});'
        );
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  return {
    base: process.env.VITE_BASE_PATH || '/',
    plugins: [
      safeViteClientPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false,
        includeAssets: [
          'manifest.json',
          'push-handler.js',
          'icon.svg',
          'favicon.png',
          'favicon.ico',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'service-worker.js',
          'assets/aistudio/logo_9bf96027.JPG',
          'assets/aistudio/binance_qr_c6b76463.jpg',
        ],
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          importScripts: ['/push-handler.js'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,JPG,svg,woff,woff2,json}'],
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(import.meta.dirname, 'index.html'),
          terms: path.resolve(import.meta.dirname, 'terms.html'),
          privacy: path.resolve(import.meta.dirname, 'privacy.html'),
          about: path.resolve(import.meta.dirname, 'about.html'),
          contact: path.resolve(import.meta.dirname, 'contact.html'),
          admin: path.resolve(import.meta.dirname, 'admin.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
