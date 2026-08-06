import { avatarUrlFor } from '@bailian-studio/api-client'
import { resolveApiUrl } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

/**
 * 用户头像（统一入口）。
 *
 * 任何持有 userId 的地方都能显示头像：自定义头像回传存储文件，未上传时由
 * `GET /api/avatars/:userId` 回传确定性 identicon 默认头像。图片加载失败时
 * AvatarImage 自动落到 initials 兜底，绝不破图。
 */
export function UserAvatar({
  userId,
  name,
  className,
  size = 'default',
}: {
  userId: string
  name?: string | null
  className?: string
  size?: 'default' | 'sm' | 'lg'
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarImage src={resolveApiUrl(avatarUrlFor(userId))} alt={name ?? undefined} />
      <AvatarFallback>{(name ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}
