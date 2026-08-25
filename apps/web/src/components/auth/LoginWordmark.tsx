/** 登录页专用空心字标；通用 BrandMark 继续用于应用内导航和法律页。 */
export function LoginWordmark() {
  return (
    <div className="login-wordmark" role="img" aria-label="Bailian Studio">
      <span className="login-wordmark__word login-wordmark__word--bailian" data-word="BAILIAN" aria-hidden="true">
        BAILIAN
      </span>
      <span className="login-wordmark__word login-wordmark__word--studio" data-word="STUDIO" aria-hidden="true">
        STUDIO
      </span>
    </div>
  )
}
