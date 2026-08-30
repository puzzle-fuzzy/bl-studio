/**
 * @bailian-studio/lib-client：app 间共享的前端客户端工具——API 单例、用户可读
 * 错误文案、chunk 加载自愈、通用共享组件（MediaLightbox / RouteErrorElement）。
 * 此前 api.ts/utils.ts/user-error.ts 在 web 与 admin 各一份且 user-error 已漂移
 * （admin 缺 8 个错误码映射与 canResendVerification）；本包以 web 版为统一基准。
 * app 侧的原模块路径保留为薄 re-export，避免大面积改导入。
 */
export { apiClient, resolveApiUrl } from './api'
export { userErrorMessage, canResendVerification } from './user-error'
export { isChunkLoadError, notifyChunkLoadFailure, installChunkRecovery } from './chunk-recovery'
export { cn, safeDomId } from './utils'
export { AppQueryProvider, createAppQueryClient, getAppQueryClient } from './query'
export { showMessage, type AppMessage } from './message'
export { notifyError } from './toast'
export { MediaLightbox, isLightboxKind, type LightboxMedia } from './components/MediaLightbox'
export { RouteErrorElement } from './components/RouteErrorElement'
