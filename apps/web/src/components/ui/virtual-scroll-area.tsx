import type { ReactNode } from 'react'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react'
import type { PartialOptions } from 'overlayscrollbars'

/**
 * 虚拟滚动条容器（OverlayScrollbars）。
 *
 * 替换原生滚动条：始终显示细长的半透明 handle（贴合设计系统的 os-theme-custom
 * 主题），内容溢出时才出现，不占布局宽度（叠加在内容之上，需要给内容留出
 * 右侧 padding 以免 handle 遮住文字）。
 */
const OVERLAY_SCROLLBAR_OPTIONS: PartialOptions = {
  scrollbars: {
    theme: 'os-theme-custom',
    autoHide: 'never',
    visibility: 'auto',
    autoHideDelay: 500,
  },
}

export function VirtualScrollArea({
  className,
  options,
  children,
}: {
  className?: string
  /** 覆盖默认滚动条配置（如临时关闭某方向滚动）。 */
  options?: PartialOptions
  children: ReactNode
}) {
  return (
    <OverlayScrollbarsComponent
      className={className}
      options={{ ...OVERLAY_SCROLLBAR_OPTIONS, ...options }}
    >
      {children}
    </OverlayScrollbarsComponent>
  )
}
