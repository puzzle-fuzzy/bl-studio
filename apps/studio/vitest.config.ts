import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 前端测试：happy-dom 环境 + Testing Library。
// 纯函数测试（lib/）与组件测试（components/features）共用此配置。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // 当前门禁覆盖纯函数/协议适配层；stores/hooks 仍需组件级测试后再纳入，
      // 避免用未覆盖的 UI 状态代码制造一个永远无法通过的全局阈值。
      include: ['src/lib/**'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
})
