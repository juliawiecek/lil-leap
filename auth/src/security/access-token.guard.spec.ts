import { ExecutionContext } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';
import { RefreshTokenService } from './refresh-token.service';
import { JwtService } from './jwt.service';
import { InvalidAccessTokenException } from '../user/exceptions/invalid-access-token.exception';

describe('AccessTokenGuard', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  let jwtService: JwtService;
  let guard: AccessTokenGuard;
  const sessions = { isActive: jest.fn() };

  const contextFor = (request: Record<string, any>) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  beforeEach(() => {
    process.env.APP_JWT_SECRET = 'test-secret-at-least-32-bytes-long-000000';
    jwtService = new JwtService();
    sessions.isActive.mockReset().mockResolvedValue(true);
    guard = new AccessTokenGuard(jwtService, sessions as unknown as RefreshTokenService);
  });

  it('lets a valid bearer token through and records the caller', async () => {
    const request = { headers: { authorization: `Bearer ${jwtService.issueToken(userId, 'trader@example.com', null, 'TRADER', null, 'test-refresh-token')}` } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect((request as any).userId).toBe(userId);
  });

  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { authorization: 'Basic abc' }],
    ['an empty bearer token', { authorization: 'Bearer ' }],
    ['an invalid token', { authorization: 'Bearer not-a-jwt' }],
  ])('rejects %s with 401', async (_label, headers) => {
    await expect(guard.canActivate(contextFor({ headers }))).rejects.toThrow(InvalidAccessTokenException);
  });

  it('rejects with 401 when verification fails unexpectedly, and records no caller', async () => {
    jest.spyOn(jwtService, 'verifyToken').mockImplementation(() => {
      throw new TypeError('verifier bug');
    });
    const request: Record<string, any> = { headers: { authorization: 'Bearer anything' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(InvalidAccessTokenException);
    expect(request.userId).toBeUndefined();
  });

  it('rejects an expired token with 401', async () => {
    jest.useFakeTimers();
    try {
      const token = jwtService.issueToken(userId, 'trader@example.com', null, 'TRADER', null, 'test-refresh-token');
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      await expect(guard.canActivate(contextFor({ headers: { authorization: `Bearer ${token}` } }))).rejects.toThrow(
        InvalidAccessTokenException,
      );
    } finally {
      jest.useRealTimers();
    }
  });
  it.each(['revoked', 'database unavailable'])('fails closed when the session is %s', async reason => {
    if (reason === 'revoked') sessions.isActive.mockResolvedValue(false);
    else sessions.isActive.mockRejectedValue(new Error('unavailable'));
    const token = jwtService.issueToken(userId, 'trader@example.com', null, 'TRADER', null, 'refresh');
    const request: Record<string, any> = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(InvalidAccessTokenException);
    expect(request.userId).toBeUndefined();
  });

});
