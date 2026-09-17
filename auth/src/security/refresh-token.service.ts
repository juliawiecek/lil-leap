import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { User } from '../user/entities/user.entity';
import { InvalidRefreshTokenException } from '../user/exceptions/invalid-refresh-token.exception';

const TOKEN_BYTES = 32;

export interface RotationResult {
  user: User;
  newRawRefreshToken: string;
}

/**
 * Issues and rotates refresh-token sessions in the `sessions` table. Tokens
 * are random values, not JWTs, so they can be revoked and looked up
 * individually; only their SHA-256 hash is ever persisted.
 */
@Injectable()
export class RefreshTokenService {
  private readonly expirationDays: number;

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {
    this.expirationDays = Number(process.env.APP_REFRESH_EXPIRATION_DAYS ?? 30);
  }

  async issue(user: User): Promise<string> {
    const rawToken = this.generateRawToken();

    const session = this.sessionRepository.create({
      user,
      tokenHash: this.hash(rawToken),
      expiresAt: new Date(Date.now() + this.expirationDays * 24 * 60 * 60 * 1000),
    });
    await this.sessionRepository.save(session);

    return rawToken;
  }

  /** An expired, revoked, or unrecognized token is rejected identically -- a reused token looks like a fresh forgery. */
  async rotate(rawRefreshToken: string): Promise<RotationResult> {
    const session = await this.sessionRepository.findOne({
      where: { tokenHash: this.hash(rawRefreshToken) },
      relations: ['user'],
    });

    if (!session || !session.isActive()) {
      throw new InvalidRefreshTokenException('Invalid or expired refresh token.');
    }

    session.revokedAt = new Date();
    session.lastActiveAt = new Date();
    await this.sessionRepository.save(session);

    const newRawRefreshToken = await this.issue(session.user);

    return { user: session.user, newRawRefreshToken };
  }

  private generateRawToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('base64');
  }
}
