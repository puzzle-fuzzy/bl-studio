import { MetricsCollector } from '@bailian-studio/shared'

/**
 * API 的进程级指标存储。通过受 admin 保护的 /api/metrics 端点和 snapshot()
 * 暴露；请求生命周期在每个响应上递增计数并记录耗时。
 */
export const appMetrics = new MetricsCollector()
