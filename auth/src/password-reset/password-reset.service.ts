import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { InvalidPasswordResetTokenException } from './invalid-password-reset-token.exception';
import { PASSWORD_RESET_DELIVERY, PasswordResetDelivery } from './password-reset-delivery';

const TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MINUTES = 20;
const DEFAULT_RESET_URL = 'http://localhost:4200/reset-password';

/** SHA-256 of the raw token, hex encoded -- the only form ever stored. */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Forgot-password flow (TS-15.9): issue a single-use, 20-minute reset link, then swap the
 * password for whoever presents it. Only token hashes are stored, and raw tokens are never logged.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly passwordEncoder: PasswordEncoderService,
    private readonly refreshTokenService: RefreshTokenService,
    @Inject(PASSWORD_RESET_DELIVERY) private readonly delivery: PasswordResetDelivery,
  ) {}

  /**
   * Sends a reset link if the email is registered. Behaves the same either way, and never throws
   * on a failed delivery, so the caller can't learn whether an account exists.
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      return;
    }

    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
    await this.replaceToken(user.userId, hashResetToken(rawToken));

    try {
      await this.delivery.send(user.email, resetLink(rawToken));
    } catch (error) {
      this.logger.error(`Password reset delivery failed errorType=${(error as Error).constructor.name}`);
    }
  }

  /** Sets the new password, burns the token and signs the user out everywhere -- all or nothing. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashResetToken(rawToken);

    await this.dataSource.transaction(async (manager) => {
      // The row lock makes two concurrent resets with one token queue up; the second finds it gone.
      const token = await manager.findOne(PasswordResetToken, { where: { tokenHash }, lock: { mode: 'pessimistic_write' } });
      if (!token || token.expiresAt.getTime() <= Date.now()) {
        throw new InvalidPasswordResetTokenException();
      }

      await manager.update(User, { userId: token.userId }, { passwordHash: this.passwordEncoder.encode(newPassword) });
      await manager.delete(PasswordResetToken, { resetTokenId: token.resetTokenId });
      await this.refreshTokenService.revokeAllForUser(token.userId, manager);
    });
  }

  /** One row per user: a new request cancels any earlier link. */
  private async replaceToken(userId: string, tokenHash: string): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PasswordResetToken, { userId });
      await manager.insert(PasswordResetToken, {
        userId,
        tokenHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      });
    });
  }
}

/** The page the link opens (PASSWORD_RESET_URL); the token rides in the query string. */
function resetLink(rawToken: string): string {
  const url = new URL(process.env.PASSWORD_RESET_URL ?? DEFAULT_RESET_URL);
  url.searchParams.set('token', rawToken);
  return url.toString();
}
