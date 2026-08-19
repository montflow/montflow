import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Port of the pi-side UI router (see /montflow ui in the
// extension). In dev, the SPA runs on Vite's own port and proxies /ws to it.
const workspacePort = Number(process.env.WORKSPACE_PORT) || 24242

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${workspacePort}`,
        ws: true,
      },
      '/api': {
        target: `http://127.0.0.1:${workspacePort}`,
        changeOrigin: true,
      },
    },
  },
})
