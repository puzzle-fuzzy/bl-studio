/**
 * 认证域拥有的事务邮件 port。
 *
 * auth 包从不导入任何 SMTP 实现：运行时应用注入 adapter，测试使用内存发送器。
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
