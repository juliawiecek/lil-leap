import { MailMessage } from '../mail/mail-message';

/** "ada.lovelace@example.com" -> "a***@example.com": enough for the owner to recognise, little for anyone else. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) {
    return '***';
  }
  return `${email[0]}***${email.slice(at)}`;
}

const NOT_YOU = [
  'If this was you, there is nothing else to do.',
  'If it was not you, reset your password straight away using "Forgot password?" on the sign-in page,',
  'and contact NextTrade support.',
];

/** Sent to the old address, so an owner whose account was taken over finds out. */
export function emailChangedNotice(to: string, newEmail: string, changedAt: Date): MailMessage {
  return {
    to,
    subject: 'Your NextTrade email address was changed',
    body: [
      `The email address for your NextTrade account was changed to ${maskEmail(newEmail)} on ${changedAt.toUTCString()}.`,
      '',
      'NextTrade will send messages to the new address from now on.',
      '',
      ...NOT_YOU,
    ].join('\n'),
  };
}

/** Sent to the new address, confirming it now receives the account's messages. */
export function emailChangedConfirmation(to: string, changedAt: Date): MailMessage {
  return {
    to,
    subject: 'This is now your NextTrade email address',
    body: [
      `This address became the email for your NextTrade account on ${changedAt.toUTCString()}.`,
      '',
      'Use it the next time you sign in.',
      '',
      ...NOT_YOU,
    ].join('\n'),
  };
}

/** Sent after a password change from Settings; the device that made the change stays signed in. */
export function passwordChangedNotice(to: string, changedAt: Date): MailMessage {
  return {
    to,
    subject: 'Your NextTrade password was changed',
    body: [
      `The password for your NextTrade account was changed on ${changedAt.toUTCString()}.`,
      '',
      'For your security, you have been signed out on every other device.',
      '',
      ...NOT_YOU,
    ].join('\n'),
  };
}
