import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Vite does NOT populate process.env from .env files for the config itself, so
  // reading process.env.VITE_API_TARGET here silently fell back to localhost:8001
  // even when .env set a remote target — the dev proxy then hit the wrong server
  // and every authed request 401'd. loadEnv() actually reads the .env files.
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || process.env.VITE_API_TARGET || 'http://localhost:8001'
  const basePath = env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || '/'

  const apiProxy = { target: apiTarget, changeOrigin: true }

  return {
    plugins: [react()],
    // Standalone deployment defaults to root path.
    // Override for subpath hosting with VITE_BASE_PATH (for example "/viewer/").
    base: basePath,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      // Proxy API routes to the AutoMem backend (VITE_API_TARGET, else local Docker).
      proxy: {
        '/graph': apiProxy,
        '/recall': apiProxy,
        '/memory': apiProxy,
        '/health': apiProxy,
      },
    },
  }
})
