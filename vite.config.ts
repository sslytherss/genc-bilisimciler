import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Varsayılan yalnızca bu bilgisayar. Telefondan denemek için: npm run dev:lan
    // (ortak/herkese açık Wi-Fi'da açık bırakmayın; aynı ağdaki herkes erişebilir)
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
        poster: resolve(import.meta.dirname, 'admin/afis.html'),
      },
    },
  },
});
