import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { User } from '../user/entities/user.entity';
import { InvalidRefreshTokenException } from '../user/exceptions/invalid-refresh-token.exception';
import { sessionInactivityMinutes } from './session-policy';

const TOKEN_BYTES = 32;

export interface RotationResult {
  user: User;
  newRawRefreshToken: string;
}

/**
 * Issues, rotates, and revokes refresh-token sessions in the `sessions` table.
 * Tokens are random values, not JWTs, so they can be revoked and looked up
 * individually; only their SHA-256 hash is ever persisted.
 *
 * BR-03 inactivity timeout: each session expires SESSION_INACTIVITY_MINUTES after
 * it is issued, and every refresh issues a new one -- so the session slides forward
 * while the client stays active and lapses once it stops refreshing.
 */
@Injectable()
export class RefreshTokenService {
  private readonly inactivityMinutes: number;

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {
    this.inactivityMinutes = sessionInactivityMinutes();
  }

  async issue(user: User): Promise<string> {
    const rawToken = this.generateRawToken();

    const session = this.sessionRepository.create({
      user,
      tokenHash: this.hash(rawToken),
      expiresAt: new Date(Date.now() + this.inactivityMinutes * 60 * 1000),
    });
    await this.sessionRepository.save(session);

    return rawToken;
  }

  /** An expired, revoked, or unrecognized token is rejected identically -- a reused token looks like a fresh forgery. */
  async rotate(rawRefreshToken: string): Promise<RotationResult> {
    const tokenHash = this.hash(rawRefreshToken);
    const session = await this.sessionRepository.findOne({ where: { tokenHash }, relations: ['user'] });

    // Revoking is the validity check, so two concurrent rotations of one token can't both succeed.
    if (!session || !(await this.revokeActive(tokenHash))) {
      throw new InvalidRefreshTokenException();
    }
    // A user disabled or deleted while signed in loses the session at its next refresh (BR-03).
    if (session.user.userStatus !== 'ACTIVE') {
      throw new InvalidRefreshTokenException();
    }

    const newRawRefreshToken = await this.issue(session.user);

    return { user: session.user, newRawRefreshToken };
  }

  /** Ends the session behind a refresh token. Idempotent: an unknown, expired, or already-revoked token is a no-op. */
  async revoke(rawRefreshToken: string): Promise<void> {
    await this.revokeActive(this.hash(rawRefreshToken));
  }

  /**
   * Ends every still-open session for a user, e.g. after a password reset, so a stolen
   * refresh token stops working. Pass the caller's transaction manager to make it atomic with the change.
   */
  async revokeAllForUser(userId: string, manager: EntityManager = this.sessionRepository.manager): Promise<void> {
    const now = new Date();
    await manager.update(Session, { user: { userId }, revokedAt: IsNull() }, { revokedAt: now, lastActiveAt: now });
  }

  /** Revokes the session only if it is still active; returns whether it was. */
  private async revokeActive(tokenHash: string): Promise<boolean> {
    const now = new Date();
    const result = await this.sessionRepository.update(
      { tokenHash, revokedAt: IsNull(), expiresAt: MoreThan(now) },
      { revokedAt: now, lastActiveAt: now },
    );
    return (result.affected ?? 0) > 0;
  }

  private generateRawToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('base64');
  }
}
