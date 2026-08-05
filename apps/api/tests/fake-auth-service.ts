import type { AuthService, PublicUser } from '@bailian-studio/auth'

export function createFakeAuthService(
  currentUser: () => Omit<PublicUser, 'emailVerifiedAt'> & { emailVerifiedAt?: string },
): AuthService {
  const user = (): PublicUser => ({
    ...currentUser(),
    emailVerifiedAt: currentUser().emailVerifiedAt ?? '2026-07-25T00:00:00.000Z',
  })
  const authResult = () => ({
    token: 'fake-token',
    user: user(),
    expiresAt: new Date('2026-07-26T00:00:00.000Z'),
  })
  const toAdminUser = (u: PublicUser) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    emailVerifiedAt: u.emailVerifiedAt,
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
  })

  return {
    register: async () => ({
      status: 'verification_required',
      email: 'u***@e.test',
      resendAvailableAt: '2026-07-25T00:01:00.000Z',
    }),
    verifyEmail: async () => authResult(),
    resendVerification: async () => ({ accepted: true }),
    login: async () => authResult(),
    loginWithGithub: async () => authResult(),
    forgotPassword: async () => ({ accepted: true }),
    resetPassword: async () => {},
    changePassword: async () => authResult(),
    verifyToken: async token => token.length > 0
      ? { user: user(), sessionId: 'sess-1' }
      : undefined,
    revokeSessionByToken: async () => {},
    revokeAllSessionsByToken: async () => {},
    adminCreateUser: async input => ({
      id: 'admin-created',
      email: input.email,
      displayName: input.displayName ?? null,
      role: input.role ?? 'user',
      emailVerifiedAt: user().emailVerifiedAt,
      createdAt: '2026-07-25T00:00:00.000Z',
      updatedAt: '2026-07-25T00:00:00.000Z',
    }),
    listActiveUsers: async () => ({ items: [toAdminUser(user())], nextCursor: undefined }),
    adminGetUser: async id => toAdminUser({ ...user(), id }),
    adminUpdateUser: async (id, input) => ({
      ...toAdminUser({ ...user(), id }),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    }),
    softDeleteUser: async () => {},
  }
}
