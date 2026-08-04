/**
 * 比较 select 选项与可见性规则使用的 manifest 值。
 *
 * 部分 provider 参数是结构化值，例如 Fun-ASR 的 channel 列表 `[0]`。UI 传输与
 * 默认值不一定保留对象同一性，因此仅靠严格相等会拒绝本应有效的已配置选项。
 */
export function modelValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true

  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}
