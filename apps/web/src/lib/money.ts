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

/**
 * 分 → 适合紧凑空间的积分数额，不带货币符号。
 * 例如 123456 分 → "1.2k"，1234567 分 → "1.2w"。
 */
export function formatCentsCompact(cents: number | undefined | null): string {
  if (cents === undefined || cents === null || !Number.isFinite(cents)) return '0'

  const amount = cents / 100
  if (amount < 1_000) {
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(amount)
  }

  const unit = amount >= 10_000 ? 'w' : 'k'
  const divisor = unit === 'w' ? 10_000 : 1_000
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(amount / divisor)}${unit}`
}
