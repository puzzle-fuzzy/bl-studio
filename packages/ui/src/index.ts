/**
 * @bailian-studio/ui：web / admin（及未来的 script、canvas）共享的 shadcn 风格
 * UI 原语。此前 16 个文件在两个 app 里字节级重复、button/input 已漂移——
 * 本包是唯一事实源，button/input 以 web 版为统一基准（web 版含 glass variant
 * 与去 focus-ring 的输入框样式）。应用侧仍保留 @/lib/utils 以承载各自的
 * safeDomId 等非 UI 工具；包内使用自己的 ../lib/utils。
 */
export * from './components/alert-dialog'
export * from './components/alert'
export * from './components/avatar'
export * from './components/badge'
export * from './components/button'
export * from './components/card'
export * from './components/chart'
export * from './components/checkbox'
export * from './components/dialog'
export * from './components/dropdown-menu'
export * from './components/input'
export * from './components/label'
export * from './components/select'
export * from './components/separator'
export * from './components/skeleton'
export * from './components/table'
export * from './components/tabs'
export * from './components/textarea'
export { cn } from './lib/utils'
