import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MailDelivery, MailMessage, formatMessage } from './mail-message';

const DEFAULT_OUTBOX_DIR = 'outbox';
/** Owner read/write only: a file can hold a live reset link. */
const OWNER_ONLY = 0o600;

/** The outbox folder: PASSWORD_RESET_OUTBOX_DIR, or ./outbox relative to the working directory. */
export function outboxDirectory(): string {
  return resolve(process.env.PASSWORD_RESET_OUTBOX_DIR ?? DEFAULT_OUTBOX_DIR);
}

/**
 * MAIL_DELIVERY=outbox (the default, used on the VM, which can't make network calls): writes each
 * email as one .eml file that any mail client opens. Logs the file name, never the content.
 */
@Injectable()
export class FileOutboxDelivery implements MailDelivery {
  private readonly logger = new Logger(FileOutboxDelivery.name);

  async send(message: MailMessage): Promise<void> {
    const content = formatMessage(message);
    const directory = outboxDirectory();
    await mkdir(directory, { recursive: true });

    const fileName = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.eml`;
    await writeFile(join(directory, fileName), content, { mode: OWNER_ONLY, flag: 'wx' });
    this.logger.log(`Email written to outbox file ${fileName}`);
  }
}
