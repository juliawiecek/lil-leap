import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { sessionInactivityMinutes } from './session-policy';
import { TraderLevel } from '../onboarding/enums/trader-level.enum';
import { InvalidAccessTokenException } from '../user/exceptions/invalid-access-token.exception';

const EMAIL_CLAIM = 'email';
const CLIENT_ID_CLAIM = 'client_id';
const TRADER_LEVEL_CLAIM = 'trader_level';

/**
 * Issues JWT access tokens. NextTrade backend and Insights backend verify
 * them locally with the same shared secret and claim shape. This service
 * verifies them only for its own read endpoints (e.g. /rules/tier-eligibility).
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
    this.secret = secret ?? 'dev-only-insecure-secret-change-me-before-deploying';
    // Never outlive the inactivity window: downstream services verify access tokens
    // statelessly, so an idle user's token must expire no later than their session.
    const inactivityMinutes = sessionInactivityMinutes();
    this.expirationMinutes = Math.min(Number(process.env.APP_JWT_EXPIRATION_MINUTES ?? inactivityMinutes), inactivityMinutes);
    this.clientId = process.env.APP_JWT_CLIENT_ID ?? 'nexttrade-web';
  }

  /** Issues a new signed access token for the given user. Users without an account (analysts) get no trader_level claim. */
  issueToken(userId: string, email: string, traderLevel?: TraderLevel | null): string {
    const claims: Record<string, string> = { [EMAIL_CLAIM]: email, [CLIENT_ID_CLAIM]: this.clientId };
    if (traderLevel) {
      claims[TRADER_LEVEL_CLAIM] = traderLevel;
    }
    return jwt.sign(claims, this.secret, {
      subject: userId,
      expiresIn: `${this.expirationMinutes}m`,
      algorithm: 'HS256',
    });
  }

  /** Verifies signature, algorithm and expiry; returns the user id (sub). */
  verifyToken(token: string): string {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
      if (typeof payload === 'string' || !payload.sub) {
        throw new InvalidAccessTokenException();
      }
      return payload.sub;
    } catch {
      throw new InvalidAccessTokenException();
    }
  }
}
