/** Injection token for the active MailDelivery; inject this, never a concrete sender. */
export const MAIL_DELIVERY = 'MAIL_DELIVERY';

const DEFAULT_SENDER = 'NextTrade <no-reply@nexttrade.local>';

/** One plain-text email. Callers build these; deliveries only transport them. */
export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Transports an email. MAIL_DELIVERY picks the implementation: `outbox` (default, the VM: no network,
 * writes .eml files) or `smtp` (dev laptops: Mailpit). Callers send after their DB commit and treat a
 * failed send as logged-not-fatal.
 */
export interface MailDelivery {
  send(message: MailMessage): Promise<void>;
}

/** The From header: MAIL_FROM, or the NextTrade no-reply address. */
export function mailSender(): string {
  return process.env.MAIL_FROM ?? DEFAULT_SENDER;
}

/** The bare address inside a "Name <address>" header value. */
export function envelopeAddress(header: string): string {
  const open = header.lastIndexOf('<');
  const close = header.lastIndexOf('>');
  return open >= 0 && close > open ? header.slice(open + 1, close) : header.trim();
}

/** A line break in a header value would let it inject extra headers or SMTP commands. */
function assertSingleLine(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Refusing an email whose ${field} contains a line break.`);
  }
}

/** A plain-text RFC 5322 message with CRLF line endings, readable by any mail client. */
export function formatMessage(message: MailMessage, from = mailSender(), date = new Date()): string {
  assertSingleLine(message.to, 'recipient');
  assertSingleLine(message.subject, 'subject');
  assertSingleLine(from, 'sender');

  const body = message.body.replaceAll('\r\n', '\n').split('\n').join('\r\n');
  return [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
  ].join('\r\n');
}
