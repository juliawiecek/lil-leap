import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { sessionInactivityMinutes } from './session-policy';

const EMAIL_CLAIM = 'email';
const CLIENT_ID_CLAIM = 'client_id';
const ROLE_CLAIM = 'user_role';

/**
 * Issues JWT access tokens. NextTrade backend and Insights backend verify
 * them locally with the same shared secret and claim shape -- this service
 * doesn't verify its own tokens, it only issues them.
 */
@Injectable()
export class JwtService {
  private readonly secret: string;
  private readonly expirationMinutes: number;
  private readonly clientId: string;

  constructor() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('APP_JWT_SECRET must be set in production; refusing to sign tokens with the dev fallback secret.');
    }
    this.secret = secret ?? 'nexttrade-web';
    this.expirationMinutes = Number(process.env.APP_JWT_EXPIRATION_MINUTES ?? 15);
    // Never outlive the inactivity window: downstream services verify access tokens
    // statelessly, so an idle user's token must expire no later than their session.
    const inactivityMinutes = sessionInactivityMinutes();
    this.expirationMinutes = Math.min(Number(process.env.APP_JWT_EXPIRATION_MINUTES ?? inactivityMinutes), inactivityMinutes);
    this.clientId = process.env.APP_JWT_CLIENT_ID ?? 'nexttrade-web';
  }

  /** Issues a new signed access token for the given user. */
  issueToken(userId: string, email: string, role: string): string {
    return jwt.sign({ [EMAIL_CLAIM]: email, [CLIENT_ID_CLAIM]: this.clientId, [ROLE_CLAIM]: role }, this.secret, {
      subject: userId,
      expiresIn: `${this.expirationMinutes}m`,
      algorithm: 'HS256',
    });
  }
}
