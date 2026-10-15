import { MailMessage } from '../mail/mail-message';

/** The link to choose a new password; expires with the token. */
export function resetLinkEmail(to: string, resetLink: string, ttlMinutes: number): MailMessage {
  return {
    to,
    subject: 'Reset your NextTrade password',
    body: [
      'A password reset was requested for your NextTrade account.',
      '',
      'Use the link below to choose a new password:',
      '',
      resetLink,
      '',
      `This link expires in ${ttlMinutes} minutes and can be used once.`,
      '',
      'If you did not request a password reset, you can ignore this email. Your password has not changed.',
    ].join('\n'),
  };
}

/** Security notice after a successful reset, so an owner who didn't do it finds out. */
export function passwordChangedEmail(to: string, changedAt: Date): MailMessage {
  return {
    to,
    subject: 'Your NextTrade password was changed',
    body: [
      `The password for your NextTrade account was changed on ${changedAt.toUTCString()}.`,
      '',
      'For your security, you have been signed out on every device.',
      '',
      'If this was you, there is nothing else to do.',
      'If it was not you, reset your password straight away using "Forgot password?" on the sign-in page,',
      'and contact NextTrade support.',
    ].join('\n'),
  };
}
