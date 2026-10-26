import { MailMessage } from '../mail/mail-message';

/** One warning per password, sent when it enters the expiry window. */
export function passwordExpiringSoonNotice(to: string, expiresAt: Date, daysLeft: number): MailMessage {
  const when = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  return {
    to,
    subject: `Your NextTrade password expires ${when}`,
    body: [
      `Your NextTrade password expires on ${expiresAt.toUTCString()} (${when}).`,
      '',
      'To keep signing in without interruption, choose a new password before then:',
      'sign in, open Settings, and pick Change password.',
      '',
      'If it expires first, the next sign-in with your current password will email you a link to choose a new one.',
      '',
      'If you no longer use NextTrade, you can ignore this email.',
    ].join('\n'),
  };
}

/** Sent when a sign-in is refused because the (correct) password is past its maximum age. */
export function passwordExpiredResetEmail(to: string, link: string, ttlMinutes: number): MailMessage {
  return {
    to,
    subject: 'Your NextTrade password has expired',
    body: [
      'Someone just signed in to NextTrade with your password, but it has passed its maximum age,',
      'so the sign-in was refused. Choose a new password here:',
      '',
      link,
      '',
      `This link expires in ${ttlMinutes} minutes and can be used once.`,
      '',
      'If that was not you, your password is known to someone else: use the link to change it now.',
    ].join('\n'),
  };
}
