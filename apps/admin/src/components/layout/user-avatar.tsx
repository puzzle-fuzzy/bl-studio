import { avatarUrlFor } from '@bailian-studio/api-client'
import { resolveApiUrl } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@bailian-studio/ui'

/**
 * 用户头像（管理后台镜像版）。
 *
 * 与 web 端同一契约：`GET /api/avatars/:userId` 有自定义头像回传文件，
 * 否则回传确定性 identicon。图片加载失败自动落 initials 兜底。
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
