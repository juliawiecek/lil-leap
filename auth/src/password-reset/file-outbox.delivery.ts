import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PasswordResetDelivery } from './password-reset-delivery';

const DEFAULT_OUTBOX_DIR = 'outbox';
const SENDER = 'NextTrade <no-reply@nexttrade.local>';
/** Owner read/write only: each file holds a live reset link. */
const OWNER_ONLY = 0o600;

/** The outbox folder: PASSWORD_RESET_OUTBOX_DIR, or ./outbox relative to the working directory. */
export function outboxDirectory(): string {
  return resolve(process.env.PASSWORD_RESET_OUTBOX_DIR ?? DEFAULT_OUTBOX_DIR);
}

/**
 * Writes each reset email as one .eml file in the outbox folder instead of sending it, because the
 * VM can't make network calls. Testers open the file to follow the link. The link is never logged.
 */
@Injectable()
export class FileOutboxDelivery implements PasswordResetDelivery {
  private readonly logger = new Logger(FileOutboxDelivery.name);

  async send(email: string, resetLink: string): Promise<void> {
    // A line break in a header would let the value inject extra headers into the message.
    if (/[\r\n]/.test(email)) {
      throw new Error('Refusing to write an email address that contains a line break.');
    }

    const directory = outboxDirectory();
    await mkdir(directory, { recursive: true });

    const fileName = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.eml`;
    await writeFile(join(directory, fileName), buildMessage(email, resetLink), { mode: OWNER_ONLY, flag: 'wx' });
    this.logger.log(`Password reset email written to outbox file ${fileName}`);
  }
}

/** A plain-text RFC 5322 message that any mail client can open. */
export function buildMessage(email: string, resetLink: string): string {
  return [
    `From: ${SENDER}`,
    `To: ${email}`,
    'Subject: Reset your NextTrade password',
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'A password reset was requested for your NextTrade account.',
    '',
    'Use the link below to choose a new password:',
    '',
    resetLink,
    '',
    'This link expires in 20 minutes and can be used once.',
    '',
    'If you did not request a password reset, you can ignore this email.',
    '',
  ].join('\r\n');
}
