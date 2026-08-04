/**
 * 金额格式化。全站账务以整数「分」（CNY）传输，展示时统一转为元。
 * 收敛了原两版中散落各处的 cost/100 逻辑。
 */

/** 分 → 元字符串，如 1234 → "¥12.34"。 */
export function formatCents(cents: number | undefined | null): string {
  if (cents === undefined || cents === null || !Number.isFinite(cents)) return '¥0.00'
  return `¥${(cents / 100).toFixed(2)}`
}

/** 分 → 带千分位的元字符串（用于积分余额等大数字）。 */
export function formatCentsWithGrouping(cents: number | undefined | null): string {
  if (cents === undefined || cents === null || !Number.isFinite(cents)) return '¥0'
  return `¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(cents / 100)}`
}
