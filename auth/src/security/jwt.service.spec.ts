import * as jwt from 'jsonwebtoken';
import { JwtService } from './jwt.service';
import { TraderLevel } from '../onboarding/enums/trader-level.enum';
import { InvalidAccessTokenException } from '../user/exceptions/invalid-access-token.exception';

describe('JwtService', () => {
  beforeEach(() => {
    process.env.APP_JWT_SECRET = 'test-secret-at-least-32-bytes-long-000000';
    delete process.env.APP_JWT_EXPIRATION_MINUTES;
    delete process.env.SESSION_INACTIVITY_MINUTES;
    process.env.APP_JWT_CLIENT_ID = 'nexttrade-web';
  });

  const lifetimeMinutes = (token: string) => {
    const payload = jwt.decode(token) as jwt.JwtPayload;
    return ((payload.exp as number) - (payload.iat as number)) / 60;
  };
  const anyToken = () => new JwtService().issueToken('11111111-1111-1111-1111-111111111111', 'trader@example.com');

  it('defaults the access token lifetime to the 10-minute inactivity window (BR-03)', () => {
    expect(lifetimeMinutes(anyToken())).toBe(10);
  });

  it('never lets an access token outlive the inactivity window', () => {
    process.env.APP_JWT_EXPIRATION_MINUTES = '60';
    expect(lifetimeMinutes(anyToken())).toBe(10);

    process.env.APP_JWT_EXPIRATION_MINUTES = '5';
    expect(lifetimeMinutes(anyToken())).toBe(5);
  });

  it('issues a token carrying the claim shape a local verifier expects', () => {
    const service = new JwtService();
    const userId = '11111111-1111-1111-1111-111111111111';
    const token = service.issueToken(userId, 'trader@example.com');

    const payload = jwt.verify(token, process.env.APP_JWT_SECRET as string) as jwt.JwtPayload;

    expect(payload.sub).toBe(userId);
    expect(payload.email).toBe('trader@example.com');
    expect(payload.client_id).toBe('nexttrade-web');
  });

  it('signs with the configured secret, not a default', () => {
    const service = new JwtService();
    const token = service.issueToken('11111111-1111-1111-1111-111111111111', 'trader@example.com');

    expect(() => jwt.verify(token, 'a-completely-different-secret-000000000')).toThrow();
  });

  it('adds a trader_level claim when the user has an account (NEXT-152)', () => {
    const token = new JwtService().issueToken('11111111-1111-1111-1111-111111111111', 'trader@example.com', TraderLevel.ADVANCED);

    expect((jwt.decode(token) as jwt.JwtPayload).trader_level).toBe('ADVANCED');
  });

  it('omits trader_level for a user without an account', () => {
    expect((jwt.decode(anyToken()) as jwt.JwtPayload).trader_level).toBeUndefined();
  });

  it('binds access tokens to a session without exposing the raw refresh token', () => {
    const service = new JwtService();
    const token = service.issueToken('user-id', 'trader@example.com', null, 'TRADER', null, 'raw-refresh-secret');
    const session = service.verifySessionToken(token);
    expect(session.userId).toBe('user-id');
    expect(session.sessionHash).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(JSON.stringify(jwt.decode(token))).not.toContain('raw-refresh-secret');
  });

  it.each([undefined, '', 'invalid-session-hash', 123])('rejects a missing or malformed session binding: %s', sid => {
    const token = jwt.sign({ sid }, process.env.APP_JWT_SECRET as string, { subject: 'user-id', expiresIn: '5m' });
    expect(() => new JwtService().verifySessionToken(token)).toThrow(InvalidAccessTokenException);
  });

  describe('verifyToken', () => {
    const userId = '11111111-1111-1111-1111-111111111111';

    it('returns the subject of a token it issued', () => {
      const service = new JwtService();
      expect(service.verifyToken(service.issueToken(userId, 'trader@example.com'))).toBe(userId);
    });

    it.each([
      ['a garbage string', () => 'not-a-jwt'],
      ['a token signed with another secret', () => jwt.sign({}, 'a-completely-different-secret-000000000', { subject: userId })],
      ['an expired token', () => jwt.sign({}, process.env.APP_JWT_SECRET as string, { subject: userId, expiresIn: -1 })],
      ['a token without a subject', () => jwt.sign({}, process.env.APP_JWT_SECRET as string)],
      ['an unsigned token', () => jwt.sign({}, '', { subject: userId, algorithm: 'none' })],
      ['a token without an expiry, which would never expire', () => jwt.sign({}, process.env.APP_JWT_SECRET as string, { subject: userId })],
      ['a token that is not valid yet', () => jwt.sign({}, process.env.APP_JWT_SECRET as string, { subject: userId, expiresIn: '5m', notBefore: '1m' })],
      ['an HS512 token, which is not the pinned algorithm', () => jwt.sign({}, process.env.APP_JWT_SECRET as string, { subject: userId, expiresIn: '5m', algorithm: 'HS512' })],
      ['a token with only two parts', () => 'e30.e30'],
      ['an empty string', () => ''],
    ])('rejects %s', (_label, makeToken) => {
      expect(() => new JwtService().verifyToken(makeToken())).toThrow(InvalidAccessTokenException);
    });
  });
});
