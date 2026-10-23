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

  /** Serialize issuance with password changes so an old login cannot create a fresh session afterwards. */
  async issue(user: User): Promise<string> {
    return this.sessionRepository.manager.transaction(async manager => {
      const current = await this.lockUser(manager, user.userId);
      if (!current || current.passwordHash !== user.passwordHash) throw new InvalidRefreshTokenException();
      return this.createSession(current, manager.getRepository(Session));
    });
  }

  private async createSession(user: User, repository: Repository<Session>): Promise<string> {
    const rawToken = this.generateRawToken();
    await repository.save(repository.create({ user, tokenHash: this.hash(rawToken),
      expiresAt: new Date(Date.now() + this.inactivityMinutes * 60 * 1000) }));
    return rawToken;
  }

  /** No cache: revocation and expiry take effect on the next authenticated request. */
  async isActive(userId: string, sessionHash: string): Promise<boolean> {
    return this.sessionRepository.existsBy({ user: { userId }, tokenHash: sessionHash,
      revokedAt: IsNull(), expiresAt: MoreThan(new Date()) });
  }

  async rotate(rawRefreshToken: string): Promise<RotationResult> {
    const tokenHash = this.hash(rawRefreshToken);
    const session = await this.sessionRepository.findOne({ where: { tokenHash }, relations: ['user'] });
    if (!session) throw new InvalidRefreshTokenException();
    return this.sessionRepository.manager.transaction(async manager => {
      const user = await this.lockUser(manager, session.user.userId);
      const repository = manager.getRepository(Session);
      if (!user || user.userStatus !== 'ACTIVE' || !(await this.revokeActive(tokenHash, repository))) {
        throw new InvalidRefreshTokenException();
      }
      return { user, newRawRefreshToken: await this.createSession(user, repository) };
    });
  }

  private lockUser(manager: EntityManager, userId: string): Promise<User | null> {
    return manager.findOne(User, { where: { userId }, lock: { mode: 'pessimistic_write' } });
  }

  /** Ends the session behind a refresh token. Idempotent: an unknown, expired, or already-revoked token is a no-op. */
  async revoke(rawRefreshToken: string): Promise<void> {
    await this.revokeActive(this.hash(rawRefreshToken));
  }

  /**
   * Ends every still-open session for a user, e.g. after a password reset, so a stolen
   * refresh token stops working. Pass the caller's transaction manager to make it atomic with the change.
   */
  async revokeAllForUser(userId: string, manager?: EntityManager): Promise<void> {
    if (!manager) return this.sessionRepository.manager.transaction(tx => this.revokeAllForUser(userId, tx));
    await this.lockUser(manager, userId);
    const now = new Date();
    await manager.update(Session, { user: { userId }, revokedAt: IsNull() }, { revokedAt: now, lastActiveAt: now });
  }

  /** Revokes the session only if it is still active; returns whether it was. */
  private async revokeActive(tokenHash: string, repository = this.sessionRepository): Promise<boolean> {
    const now = new Date();
    const result = await repository.update(
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
