import { ExecutionContext } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';
import { JwtService } from './jwt.service';
import { InvalidAccessTokenException } from '../user/exceptions/invalid-access-token.exception';

describe('AccessTokenGuard', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  let jwtService: JwtService;
  let guard: AccessTokenGuard;

  const contextFor = (request: Record<string, any>) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  beforeEach(() => {
    process.env.APP_JWT_SECRET = 'test-secret-at-least-32-bytes-long-000000';
    jwtService = new JwtService();
    guard = new AccessTokenGuard(jwtService);
  });

  it('lets a valid bearer token through and records the caller', () => {
    const request = { headers: { authorization: `Bearer ${jwtService.issueToken(userId, 'trader@example.com')}` } };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect((request as any).userId).toBe(userId);
  });

  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { authorization: 'Basic abc' }],
    ['an empty bearer token', { authorization: 'Bearer ' }],
    ['an invalid token', { authorization: 'Bearer not-a-jwt' }],
  ])('rejects %s with 401', (_label, headers) => {
    expect(() => guard.canActivate(contextFor({ headers }))).toThrow(InvalidAccessTokenException);
  });
});
