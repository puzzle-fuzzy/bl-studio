/**
 * 生成状态的语义色调（semantic tone）映射。
 *
 * @bailian-studio/design-tokens 在 TS 侧暴露的语义色抽象层：把任意业务状态归约为
 * 五种 tone（neutral / info / success / warning / danger），由 UI 组件再
 * 映射到具体的 CSS 变量或组件 variant。这样做的目的是把"状态→颜色"与
 * "颜色→具体样式"两件事解耦——新增状态只需在此登记 tone，无需到处改 UI。
 *
 * 与 tokens.css 的对应：tone 命名与 `--rb-success` / `--rb-warning` /
 * `--rb-danger` 等语义色变量一一对齐；apps 消费时既可直接读 CSS 变量，也可
 * 经由 shadcn variant 间接消费（参考 apps/web 的 StatusBadge：先取 tone，
 * 再用 TONE_TO_VARIANT 翻译成 Badge variant）。
 *
 * 主题机制：当前仅 light 一套（见 tokens.css 的 :root）；若未来引入 dark
 * 主题，只需在 `[data-theme=dark]` 等选择器下覆写同一批 `--rb-*` 变量，
 * tone 映射本身保持不变。
 *
 * 命名约定：CSS 变量统一使用 `--rb-` 前缀（bailian-studio 缩写），避免与 shadcn
 * 等第三方库的变量冲突。
 */

/**
 * 语义色调。五种 tone 与 tokens.css 中 `--rb-*` 语义色变量对齐，
 * 用于先把业务状态归一化为 tone，再由组件决定具体渲染样式。
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/**
 * Generation 状态到 tone 的映射表。
 *
 * 键覆盖 @bailian-studio/event-bus 的 GenerationStatus 联合；注意故意未登记
 * `processing`（@bailian-studio/generation-repository 内部的中间态，不在
 * GenerationStatus 中）——消费方对该值会落到缺省兜底 `?? 'neutral'`。
 * 消费方取值时务必保留这一兜底，以便后端后续新增状态时 UI 不会崩，
 * 而是退化为中性色。
 */
export const GENERATION_STATUS_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  submitting: 'warning',
  provider_processing: 'info',
  saving_output: 'info',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'neutral',
}
