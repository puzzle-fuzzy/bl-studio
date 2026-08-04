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

  return {
    register: async () => ({
      status: 'verification_required',
      email: 'u***@e.test',
      resendAvailableAt: '2026-07-25T00:01:00.000Z',
    }),
    verifyEmail: async () => authResult(),
    resendVerification: async () => ({ accepted: true }),
    login: async () => authResult(),
    forgotPassword: async () => ({ accepted: true }),
    resetPassword: async () => {},
    changePassword: async () => authResult(),
    verifyToken: async token => token.length > 0
      ? { user: user(), sessionId: 'sess-1' }
      : undefined,
    revokeSessionByToken: async () => {},
    revokeAllSessionsByToken: async () => {},
  }
}
