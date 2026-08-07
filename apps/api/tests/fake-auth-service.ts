import { AuthError, type AuthService, type PublicUser } from '@bailian-studio/auth'

export interface FakeAuthService extends AuthService {
  /** 测试开关：置位后 user() 的 bannedAt 非空，且 verifyToken/login 等按封禁语义响应。 */
  __setBanned(banned: boolean): void
}

export function createFakeAuthService(
  currentUser: () => Omit<PublicUser, 'emailVerifiedAt' | 'bannedAt' | 'hasAvatar'> & {
    emailVerifiedAt?: string
    hasAvatar?: boolean
  },
): FakeAuthService {
  let banned = false
  const user = (): PublicUser => ({
    ...currentUser(),
    hasAvatar: currentUser().hasAvatar ?? false,
    emailVerifiedAt: currentUser().emailVerifiedAt ?? '2026-07-25T00:00:00.000Z',
    bannedAt: banned ? '2026-07-25T00:00:00.000Z' : null,
  })
  const authResult = () => ({
    token: 'fake-token',
    user: user(),
    expiresAt: new Date('2026-07-26T00:00:00.000Z'),
  })
  const requireNotBanned = () => {
    if (banned) throw new AuthError('AUTH_BANNED', '该账号已被封禁，请联系管理员。')
  }
  const toAdminUser = (u: PublicUser) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    emailVerifiedAt: u.emailVerifiedAt,
    bannedAt: u.bannedAt,
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
  })

  return {
    __setBanned(next) {
      banned = next
    },
    register: async () => ({
      status: 'verification_required',
      email: 'user@e.test',
      displayEmail: 'u***@e.test',
      resendAvailableAt: '2026-07-25T00:01:00.000Z',
    }),
    verifyEmail: async () => {
      requireNotBanned()
      return authResult()
    },
    resendVerification: async () => ({ accepted: true }),
    login: async () => {
      requireNotBanned()
      return authResult()
    },
    loginWithGithub: async () => {
      requireNotBanned()
      return authResult()
    },
    forgotPassword: async () => ({ accepted: true }),
    resetPassword: async () => {},
    changePassword: async () => {
      requireNotBanned()
      return authResult()
    },
    verifyToken: async token => token.length > 0 && !banned
      ? { user: user(), sessionId: 'sess-1' }
      : undefined,
    revokeSessionByToken: async () => {},
    revokeAllSessionsByToken: async () => {},
    updateProfile: async (_id, input) => ({ ...user(), displayName: input.displayName }),
    updateAvatar: async _id => ({ ...user(), hasAvatar: true }),
    removeAvatar: async _id => ({ ...user(), hasAvatar: false }),
    getUserAvatarStorageKey: async () => null,
    adminCreateUser: async input => ({
      id: 'admin-created',
      email: input.email,
      displayName: input.displayName ?? null,
      role: input.role ?? 'user',
      emailVerifiedAt: user().emailVerifiedAt,
      bannedAt: null,
      createdAt: '2026-07-25T00:00:00.000Z',
      updatedAt: '2026-07-25T00:00:00.000Z',
    }),
    listActiveUsers: async input => ({
      items: [toAdminUser(user())],
      nextCursor: undefined,
      // offset 分页模式（带 page）返回总条数，供前端翻页。
      ...(input?.page !== undefined ? { total: 37 } : {}),
    }),
    adminGetUser: async id => toAdminUser({ ...user(), id }),
    adminUpdateUser: async (id, input) => ({
      ...toAdminUser({ ...user(), id }),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    }),
    softDeleteUser: async () => {},
    adminBanUser: async () => {
      banned = true
    },
    adminUnbanUser: async () => {
      banned = false
    },
    adminBatchBanUsers: async () => {
      banned = true
    },
    adminBatchUnbanUsers: async () => {
      banned = false
    },
    adminBatchDeleteUsers: async () => {},
    adminStats: async () => ({ registrationsByDay: [], totalUsers: 1 }),
  }
}
