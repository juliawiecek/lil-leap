import * as jwt from 'jsonwebtoken';
import { JwtService } from './jwt.service';

describe('JwtService', () => {
  beforeEach(() => {
    process.env.APP_JWT_SECRET = 'test-secret-at-least-32-bytes-long-000000';
    process.env.APP_JWT_EXPIRATION_MINUTES = '60';
    process.env.APP_JWT_CLIENT_ID = 'nexttrade-web';
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
});
