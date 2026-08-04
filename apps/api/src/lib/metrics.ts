import { MetricsCollector } from '@bailian-studio/shared'

/**
 * API 的进程级指标存储。通过 snapshot() 暴露（例如供未来的 /metrics 端点
 * 或结构化日志输出使用）；请求生命周期在每个响应上递增计数并记录耗时。
 */
export const appMetrics = new MetricsCollector()
