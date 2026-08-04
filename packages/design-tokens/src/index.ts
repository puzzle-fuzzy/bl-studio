/**
 * @bailian-studio/design-tokens 包入口，聚合 TS 侧的语义令牌导出。
 *
 * CSS 侧的颜色 / 圆角等基础变量不在本文件——apps 应直接
 * `import '@bailian-studio/design-tokens/tokens.css'` 引入 `:root` 下的 `--rb-*`
 * 变量；TS 侧的语义抽象（如状态→tone 映射）则从这里导入。
 */
export { GENERATION_STATUS_TONES, type StatusTone } from './status-tokens'
