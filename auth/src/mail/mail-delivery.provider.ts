import { Provider } from '@nestjs/common';
import { MAIL_DELIVERY, MailDelivery } from './mail-message';
import { FileOutboxDelivery } from './file-outbox.delivery';
import { SmtpDelivery } from './smtp.delivery';

/** MAIL_DELIVERY=outbox (default; the VM) or smtp (dev laptops with Mailpit). Anything else stops startup. */
export function createMailDelivery(mode = process.env.MAIL_DELIVERY ?? 'outbox'): MailDelivery {
  if (mode === 'smtp') {
    return new SmtpDelivery();
  }
  if (mode === 'outbox') {
    return new FileOutboxDelivery();
  }
  throw new Error(`MAIL_DELIVERY must be "outbox" or "smtp", not "${mode}".`);
}

export const mailDeliveryProvider: Provider = { provide: MAIL_DELIVERY, useFactory: () => createMailDelivery() };
