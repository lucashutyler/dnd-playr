import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const API = 'http://localhost:3000'

export default defineConfig({
  root: 'client',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./client/src', import.meta.url)) },
  },
  build: {
    // Production is a single Node process serving this output.
    outDir: '../server/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Listen on the LAN so you can open the dev build on an actual phone.
    host: true,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/ws': { target: API, ws: true },
    },
  },
})
