/**
 * Vite 宿主注入的环境变量契约（消费方是 Vite app 时 import.meta.env 由宿主替换）。
 * 本包只读 VITE_API_ORIGIN 一个键；不用 vite/client 全量类型，避免引入 vite 依赖。
 */
interface ImportMeta {
  readonly env: Record<string, string | undefined>
}
