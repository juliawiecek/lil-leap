import { createHash } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { RefreshTokenService } from './refresh-token.service';
import { Session } from './entities/session.entity';
import { InvalidRefreshTokenException } from '../user/exceptions/invalid-refresh-token.exception';

describe('RefreshTokenService', () => {
  const user = { userId: '11111111-1111-1111-1111-111111111111', email: 'trader@example.com' } as any;
  const hashOf = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('base64');

  let repository: Record<'create' | 'save' | 'findOne' | 'update', jest.Mock>;
  let service: RefreshTokenService;

  beforeEach(() => {
    delete process.env.SESSION_INACTIVITY_MINUTES;
    repository = {
      create: jest.fn((fields) => fields),
      save: jest.fn(async (session) => session),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    service = new RefreshTokenService(repository as unknown as Repository<Session>);
  });

  it('issue persists only the hash of the raw token', async () => {
    const raw = await service.issue(user);

    const saved = repository.save.mock.calls[0][0] as Session;
    expect(saved.tokenHash).toBe(hashOf(raw));
    expect(saved.tokenHash).not.toContain(raw);
  });

  it('issue expires the session after the 10-minute inactivity window (BR-03)', async () => {
    const before = Date.now();
    await service.issue(user);

    const saved = repository.save.mock.calls[0][0] as Session;
    expect(saved.expiresAt.getTime() - before).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(saved.expiresAt.getTime() - before).toBeLessThan(10 * 60 * 1000 + 5000);
  });

  it('honours SESSION_INACTIVITY_MINUTES', async () => {
    process.env.SESSION_INACTIVITY_MINUTES = '3';
    service = new RefreshTokenService(repository as unknown as Repository<Session>);
    const before = Date.now();
    await service.issue(user);

    const saved = repository.save.mock.calls[0][0] as Session;
    expect(saved.expiresAt.getTime() - before).toBeLessThan(3 * 60 * 1000 + 5000);
  });

  it('rotate revokes the old session and issues a new token', async () => {
    repository.findOne.mockResolvedValue({ user } as Session);
    repository.update.mockResolvedValue({ affected: 1 } as any);

    const result = await service.rotate('old-raw-token');

    expect(repository.update).toHaveBeenCalledWith(
      { tokenHash: hashOf('old-raw-token'), revokedAt: IsNull(), expiresAt: MoreThan(expect.any(Date)) },
      { revokedAt: expect.any(Date), lastActiveAt: expect.any(Date) },
    );
    expect(result.user).toBe(user);
    expect(result.newRawRefreshToken).not.toBe('old-raw-token');
  });

  it('rotate rejects an unknown token', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.rotate('unknown')).rejects.toThrow(InvalidRefreshTokenException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rotate rejects a token whose session is revoked or expired, without issuing a new one', async () => {
    repository.findOne.mockResolvedValue({ user } as Session);
    repository.update.mockResolvedValue({ affected: 0 } as any);

    await expect(service.rotate('already-used')).rejects.toThrow(InvalidRefreshTokenException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('revoke is a no-op for a token that is not active', async () => {
    repository.update.mockResolvedValue({ affected: 0 } as any);

    await expect(service.revoke('unknown')).resolves.toBeUndefined();
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: hashOf('unknown') }),
      expect.anything(),
    );
  });
});
