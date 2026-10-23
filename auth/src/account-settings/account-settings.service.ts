import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { normalizeEmail } from '../user/user.service';
import { CustomerProfile } from '../onboarding/entities/customer-profile.entity';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILURES } from '../security/login-policy';
import { MAIL_DELIVERY, MailDelivery, MailMessage } from '../mail/mail-message';
import { IncorrectPasswordException } from '../user/exceptions/incorrect-password.exception';
import { EmailInUseException } from '../user/exceptions/email-in-use.exception';
import { ProfileNotFoundException } from '../user/exceptions/profile-not-found.exception';
import { InvalidAccessTokenException } from '../user/exceptions/invalid-access-token.exception';
import { PHONE_MIN_DIGITS, UpdateProfileRequestDto } from './dto/update-profile-request.dto';
import { emailChangedConfirmation, emailChangedNotice, passwordChangedNotice } from './account-settings-emails';

/** audit_log event types written by this service (PS-07). */
export const AuditEvent = {
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  EMAIL_CHANGED: 'EMAIL_CHANGED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
} as const;

const PROFILE_FIELDS = ['address', 'phone'] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

/** Postgres unique_violation: two requests raced to take the same email. */
const UNIQUE_VIOLATION = '23505';

type Checked<T> = { ok: true; value: T } | { ok: false };

/**
 * Account settings for the signed-in caller only (PS-07, BR-02): contact details, email and password.
 * Every change and its audit_log row commit together. Audit payloads name what changed, never the
 * values, so no password, SSN or contact detail is copied into the log. Notices go out after commit;
 * a failed send is logged and never fails the request.
 */
@Injectable()
export class AccountSettingsService {
  private readonly logger = new Logger(AccountSettingsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly passwordEncoder: PasswordEncoderService,
    private readonly refreshTokenService: RefreshTokenService,
    @Inject(MAIL_DELIVERY) private readonly mail: MailDelivery,
  ) {}

  /** Updates address and/or phone. Unchanged values are not rewritten and an all-unchanged request writes no audit row. */
  async updateProfile(userId: string, request: UpdateProfileRequestDto): Promise<CustomerProfile> {
    const sent = PROFILE_FIELDS.filter((field) => request[field] !== undefined);
    if (sent.length === 0) {
      throw new BadRequestException('Send an address, a phone number or both.');
    }
    if (request.phone !== undefined && request.phone.replace(/\D/g, '').length < PHONE_MIN_DIGITS) {
      throw new BadRequestException('A phone number needs at least 7 digits.');
    }

    return this.dataSource.transaction(async (manager) => {
      const profile = await manager.findOne(CustomerProfile, { where: { user: { userId } }, relations: { user: true } });
      if (!profile) {
        throw new ProfileNotFoundException();
      }
      const changed = sent.filter((field) => profile[field] !== request[field]);
      if (changed.length === 0) {
        return profile;
      }
      const changes: Partial<Record<ProfileField, string>> = {};
      for (const field of changed) {
        changes[field] = profile[field] = request[field]!;
      }
      await manager
        .createQueryBuilder()
        .update(CustomerProfile)
        .set(changes)
        .where('user_id = :userId', { userId })
        .execute();
      await this.audit(manager, userId, AuditEvent.PROFILE_UPDATED, { fields: changed });
      return profile;
    });
  }

  /** Moves sign-in to a new email after checking the current password. Tells both addresses. */
  async changeEmail(userId: string, newEmail: string, currentPassword: string): Promise<User> {
    const email = normalizeEmail(newEmail);
    let previousEmail = '';
    const checked = await this.withCurrentPassword(userId, currentPassword, async (manager, user) => {
      if (normalizeEmail(user.email) === email) {
        throw new BadRequestException('The new email is the same as the current one.');
      }
      const owner = await manager
        .createQueryBuilder(User, 'user')
        .where('LOWER(TRIM(user.email)) = :email', { email })
        .getOne();
      if (owner) {
        throw new EmailInUseException();
      }
      previousEmail = user.email;
      await manager.update(User, { userId }, { email });
      await this.audit(manager, userId, AuditEvent.EMAIL_CHANGED, {});
      return { ...user, email };
    }).catch((error: unknown) => {
      // The unique index is the final word when two accounts race for the same address.
      if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === UNIQUE_VIOLATION) {
        throw new EmailInUseException();
      }
      throw error;
    });

    const changedAt = new Date();
    await this.sendSafely(emailChangedNotice(previousEmail, email, changedAt));
    await this.sendSafely(emailChangedConfirmation(email, changedAt));
    return checked;
  }

  /**
   * Sets a new password after checking the current one, then ends every session the user holds --
   * including this one, so the caller must be given a fresh token pair (the controller does that).
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<User> {
    const user = await this.withCurrentPassword(userId, currentPassword, async (manager, owner) => {
      const passwordHash = this.passwordEncoder.encode(newPassword);
      await manager.update(User, { userId }, { passwordHash });
      await this.refreshTokenService.revokeAllForUser(userId, manager);
      await this.audit(manager, userId, AuditEvent.PASSWORD_CHANGED, { otherSessionsSignedOut: true });
      return { ...owner, passwordHash };
    });

    await this.sendSafely(passwordChangedNotice(user.email, new Date()));
    return user;
  }

  /**
   * Runs `change` only when `password` is the user's current one. A wrong password counts toward the
   * same lockout as sign-in (BR-03), and that count commits even though the request then fails --
   * so the 401 is thrown after the transaction, never inside it.
   */
  private async withCurrentPassword<T>(
    userId: string,
    password: string,
    change: (manager: EntityManager, user: User) => Promise<T>,
  ): Promise<T> {
    const result = await this.dataSource.transaction(async (manager): Promise<Checked<T>> => {
      const user = await manager
        .createQueryBuilder(User, 'user')
        .where('user.userId = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne();
      if (!user) {
        // The token named a user that no longer exists.
        throw new InvalidAccessTokenException();
      }
      const matches = this.passwordEncoder.matches(password, user.passwordHash);
      const now = Date.now();
      if (user.lockedUntil && user.lockedUntil.getTime() > now) {
        return { ok: false }; // Attempts during the lock neither succeed nor extend it.
      }
      if (!matches) {
        const attempts = Math.min((user.lockedUntil ? 0 : user.failedLoginAttempts) + 1, LOGIN_MAX_FAILURES);
        await manager.update(User, { userId }, {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= LOGIN_MAX_FAILURES ? new Date(now + LOGIN_LOCK_MINUTES * 60_000) : null,
        });
        return { ok: false };
      }
      if (user.failedLoginAttempts !== 0 || user.lockedUntil) {
        await manager.update(User, { userId }, { failedLoginAttempts: 0, lockedUntil: null });
      }
      return { ok: true, value: await change(manager, user) };
    });
    if (!result.ok) {
      throw new IncorrectPasswordException();
    }
    return result.value;
  }

  private async audit(manager: EntityManager, userId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await manager.query(
      `INSERT INTO audit_log (user_id, actor_type, event_type, payload) VALUES ($1, 'USER', $2, $3::jsonb)`,
      [userId, eventType, JSON.stringify(payload)],
    );
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
