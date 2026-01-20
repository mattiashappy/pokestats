import path from 'node:path'

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    define: {
      'import.meta.env.ADMIN_EMAIL': JSON.stringify(env.ADMIN_EMAIL ?? ''),
      'import.meta.env.ADMIN_PASS': JSON.stringify(env.ADMIN_PASS ?? '')
    },
    server: {
      port: 5173
    }
  }
})
