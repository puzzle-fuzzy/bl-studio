import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const envRoot = fileURLToPath(new URL('../../deploy/env', import.meta.url))
const webRoot = fileURLToPath(new URL('.', import.meta.url))

// 开发端口 5002；/api 代理到 API(5003)，使会话 cookie 同源，规避 CORS。
// 生产环境由 nginx 反代 /api（见 deploy/nginx）。
export default defineConfig({
  server: {
    port: 5002,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5003',
        changeOrigin: true,
      },
    },
  },
  envDir: envRoot,
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(webRoot, 'src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|react-router|zustand|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-ui',
              test: /node_modules[\\/](radix-ui|@radix-ui|sonner|cmdk|vaul|@base-ui|@shadcn|recharts|class-variance-authority|tailwind-merge)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
