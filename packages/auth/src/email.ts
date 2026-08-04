/**
 * Transactional email port owned by the authentication domain.
 *
 * The auth package never imports an SMTP implementation. Runtime applications
 * inject an adapter while tests use an in-memory sender.
 */
export interface TransactionalEmailSender {
  sendEmailVerification(input: {
    to: string
    verifyUrl: string
    expiresAt: string
  }): Promise<void>
  sendPasswordReset(input: {
    to: string
    resetUrl: string
    expiresAt: string
  }): Promise<void>
}
