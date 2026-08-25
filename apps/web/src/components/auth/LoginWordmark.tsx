/** 登录页空心字标；应用侧栏复用完整字标，并使用同视觉语言的紧凑 BS 标记。 */
export function LoginWordmark({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <div className={`login-wordmark login-wordmark--compact${className ? ` ${className}` : ''}`} role="img" aria-label="Bailian Studio">
        <span className="login-wordmark__compact-primary" aria-hidden="true">B</span>
        <span className="login-wordmark__compact-secondary" aria-hidden="true">S</span>
      </div>
    )
  }

  return (
    <div className={`login-wordmark${className ? ` ${className}` : ''}`} role="img" aria-label="Bailian Studio">
      <span className="login-wordmark__word login-wordmark__word--bailian" data-word="BAILIAN" aria-hidden="true">
        BAILIAN
      </span>
      <span className="login-wordmark__word login-wordmark__word--studio" data-word="STUDIO" aria-hidden="true">
        STUDIO
      </span>
    </div>
  )
}
