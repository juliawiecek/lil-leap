import { envelopeAddress, formatMessage, mailSender } from './mail-message';
import { FileOutboxDelivery } from './file-outbox.delivery';
import { SmtpDelivery } from './smtp.delivery';
import { createMailDelivery } from './mail-delivery.provider';

const message = { to: 'trader@example.com', subject: 'Hello', body: 'line one\nline two' };
const sentAt = new Date('2026-10-13T20:00:00Z');

describe('formatMessage', () => {
  it('writes the headers, a blank line and a CRLF body', () => {
    expect(formatMessage(message, 'NextTrade <no-reply@nexttrade.local>', sentAt)).toBe(
      [
        'From: NextTrade <no-reply@nexttrade.local>',
        'To: trader@example.com',
        'Subject: Hello',
        'Date: Tue, 13 Oct 2026 20:00:00 GMT',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'line one',
        'line two',
        '',
      ].join('\r\n'),
    );
  });

  it.each([
    ['recipient', { ...message, to: 'a@example.com\nBcc: b@example.com' }],
    ['subject', { ...message, subject: 'Hi\r\nBcc: b@example.com' }],
  ])('refuses a %s with a line break', (field, unsafe) => {
    expect(() => formatMessage(unsafe, 'x@example.com', sentAt)).toThrow(`email whose ${field} contains a line break`);
  });
});

describe('mail sender and envelope address', () => {
  afterEach(() => {
    delete process.env.MAIL_FROM;
  });

  it('defaults to the NextTrade no-reply address and honours MAIL_FROM', () => {
    expect(mailSender()).toBe('NextTrade <no-reply@nexttrade.local>');
    process.env.MAIL_FROM = 'desk@nexttrade.test';
    expect(mailSender()).toBe('desk@nexttrade.test');
  });

  it('pulls the bare address out of a display-name header', () => {
    expect(envelopeAddress('NextTrade <no-reply@nexttrade.local>')).toBe('no-reply@nexttrade.local');
    expect(envelopeAddress(' plain@nexttrade.local ')).toBe('plain@nexttrade.local');
  });
});

describe('createMailDelivery', () => {
  it('uses the outbox by default and SMTP when MAIL_DELIVERY=smtp', () => {
    expect(createMailDelivery(undefined)).toBeInstanceOf(FileOutboxDelivery);
    expect(createMailDelivery('outbox')).toBeInstanceOf(FileOutboxDelivery);
    expect(createMailDelivery('smtp')).toBeInstanceOf(SmtpDelivery);
  });

  it('stops startup on an unknown MAIL_DELIVERY value', () => {
    expect(() => createMailDelivery('pigeon')).toThrow('MAIL_DELIVERY must be "outbox" or "smtp", not "pigeon".');
  });
});
