import { MetricsCollector } from '@bailian-studio/shared'

/**
 * Process-wide metrics store for the API. Surfaced via snapshot() (e.g. for a
 * future /metrics endpoint or structured log emission); the request lifecycle
 * increments counters and records timings on every response.
 */
export const appMetrics = new MetricsCollector()
