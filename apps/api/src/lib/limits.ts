/**
 * 兼容出口：生成限额的解析已下沉到 @bailian-studio/shared（API 与 worker 共用，
 * 保证两条创建路径按同一份限额做原子准入）。此处仅保留原导入路径。
 */
export { readGenerationLimits, type GenerationLimits } from '@bailian-studio/shared'
