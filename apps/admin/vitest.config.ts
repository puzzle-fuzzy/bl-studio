import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 管理后台前端测试：happy-dom 环境。只测纯函数层（lib/），不写 UI/样式测试。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    // R2-P1-10：关掉 passWithNoTests，让「全绿但实际没跑」的 admin 空跑变红。
    passWithNoTests: false,
  },
})
