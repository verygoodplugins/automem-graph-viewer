import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // Standalone deployment defaults to root path.
  // Override for subpath hosting with VITE_BASE_PATH (for example "/viewer/").
  base: process.env.VITE_BASE_PATH || '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy to Railway backend (or override via VITE_API_TARGET env var)
      '/graph': {
        target: process.env.VITE_API_TARGET || 'https://automem.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/recall': {
        target: process.env.VITE_API_TARGET || 'https://automem.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/memory': {
        target: process.env.VITE_API_TARGET || 'https://automem.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/health': {
        target: process.env.VITE_API_TARGET || 'https://automem.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
