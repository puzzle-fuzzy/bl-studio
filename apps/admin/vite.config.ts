import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const envRoot = fileURLToPath(new URL('../../deploy/env', import.meta.url))
const adminRoot = fileURLToPath(new URL('.', import.meta.url))

/**
 * 管理后台构建：base 固定为 `/admin/`（nginx 以 /admin 前缀同源服务）；
 * 开发端口 5004，/api 代理到 API(5003)，使会话 cookie 同源。
 */
export default defineConfig({
  base: '/admin/',
  server: {
    port: 5004,
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
      '@': path.resolve(adminRoot, 'src'),
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
              test: /node_modules[\\/](radix-ui|@radix-ui|sonner|cmdk|@base-ui|@shadcn|class-variance-authority|tailwind-merge)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
