import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MAIL_DELIVERY, MailDelivery, MailMessage } from '../mail/mail-message';
import { PasswordResetService } from '../password-reset/password-reset.service';
import {
  PASSWORD_EXPIRY_SWEEP_MINUTES, PASSWORD_EXPIRY_WARNING_DAYS, PASSWORD_MAX_AGE_DAYS,
  daysUntilExpiry, passwordExpiresAt,
} from '../security/password-policy';
import { passwordExpiringSoonNotice } from './password-expiry-emails';

/** Written to audit_log when a warning goes out, and when an expired password is refused. */
export const PasswordExpiryEvent = {
  WARNED: 'PASSWORD_EXPIRY_WARNED',
  EXPIRED_SIGN_IN: 'PASSWORD_EXPIRED_SIGN_IN',
} as const;

interface WarnedRow {
  user_id: string;
  email: string;
  password_changed_at: Date | string;
}

/**
 * Password ageing (BR-03). A sweep claims every ACTIVE user whose password has entered the warning
 * window and has not been warned for this password, in one UPDATE ... RETURNING, so two Identity
 * instances never both email the same person. Emails go out after the commit; a failed send is
 * logged and the row stays claimed, matching how every other notice here behaves.
 */
@Injectable()
export class PasswordExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PasswordExpiryService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly dataSource: DataSource,
    private readonly passwordReset: PasswordResetService,
    @Inject(MAIL_DELIVERY) private readonly mail: MailDelivery,
  ) {}

  onModuleInit(): void {
    if (PASSWORD_EXPIRY_SWEEP_MINUTES === 0) {
      return;
    }
    const run = () => this.warnExpiringSoon().catch((error: unknown) => {
      this.logger.error(`Password expiry sweep failed errorType=${(error as Error)?.constructor?.name ?? 'Unknown'}`);
    });
    void run();
    this.timer = setInterval(run, PASSWORD_EXPIRY_SWEEP_MINUTES * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * Emails everyone whose password expires within the warning window and has not been told yet.
   * Returns how many were warned this time.
   */
  async warnExpiringSoon(now = new Date()): Promise<number> {
    const rows = await this.dataSource.transaction(async (manager) => {
      const claimed: WarnedRow[] = await manager.query(
        `UPDATE users
            SET password_expiry_warned_at = $1
          WHERE user_status = 'ACTIVE'
            AND password_changed_at <= $1::timestamptz - make_interval(days => $2)
            AND password_changed_at >  $1::timestamptz - make_interval(days => $3)
            AND (password_expiry_warned_at IS NULL OR password_expiry_warned_at < password_changed_at)
          RETURNING user_id, email, password_changed_at`,
        [now, PASSWORD_MAX_AGE_DAYS - PASSWORD_EXPIRY_WARNING_DAYS, PASSWORD_MAX_AGE_DAYS],
      );
      for (const row of claimed) {
        await manager.query(
          `INSERT INTO audit_log (user_id, actor_type, event_type, payload) VALUES ($1, 'SYSTEM', $2, $3::jsonb)`,
          [row.user_id, PasswordExpiryEvent.WARNED, JSON.stringify({ expiresAt: passwordExpiresAt(new Date(row.password_changed_at)) })],
        );
      }
      return claimed;
    });

    for (const row of rows) {
      const changedAt = new Date(row.password_changed_at);
      await this.sendSafely(passwordExpiringSoonNotice(row.email, passwordExpiresAt(changedAt), daysUntilExpiry(changedAt, now)));
    }
    if (rows.length) {
      this.logger.log(`Password expiry warnings sent count=${rows.length}`);
    }
    return rows.length;
  }

  /**
   * A correct but expired password was refused at sign-in: record it and email a reset link, so the
   * user can get back in without a support call. Never throws; the sign-in response is already decided.
   */
  async handleExpiredSignIn(userId: string, email: string): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO audit_log (user_id, actor_type, event_type, payload) VALUES ($1, 'USER', $2, '{}'::jsonb)`,
        [userId, PasswordExpiryEvent.EXPIRED_SIGN_IN],
      );
      await this.passwordReset.requestReset(email, { expired: true });
    } catch (error) {
      this.logger.error(`Expired-password reset link failed errorType=${(error as Error)?.constructor?.name ?? 'Unknown'}`);
    }
  }

  /** Logs a failed send by error type only: the message holds an email address. */
  private async sendSafely(message: MailMessage): Promise<void> {
    try {
      await this.mail.send(message);
    } catch (error) {
      this.logger.error(`Email delivery failed errorType=${(error as Error).constructor.name}`);
    }
  }
}
