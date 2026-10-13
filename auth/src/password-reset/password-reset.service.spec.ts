import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PasswordResetService, RESET_TOKEN_TTL_MINUTES, hashResetToken } from './password-reset.service';
import { PasswordResetDelivery } from './password-reset-delivery';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { InvalidPasswordResetTokenException } from './invalid-password-reset-token.exception';
import { UserService } from '../user/user.service';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { RefreshTokenService } from '../security/refresh-token.service';

const user = { userId: '11111111-1111-1111-1111-111111111111', email: 'trader@example.com' };

/** Records each reset link instead of sending it. */
class InMemoryDelivery implements PasswordResetDelivery {
  readonly sent: { email: string; resetLink: string }[] = [];

  async send(email: string, resetLink: string): Promise<void> {
    this.sent.push({ email, resetLink });
  }

  lastToken(): string {
    const link = this.sent.at(-1)?.resetLink ?? '';
    return new URL(link).searchParams.get('token') ?? '';
  }
}

/** Just enough of an EntityManager for the reset flow: token rows and a password column per user. */
class InMemoryManager {
  tokens: PasswordResetToken[] = [];
  readonly passwordHashes = new Map<string, string>();
  private nextId = 0;

  async findOne(_entity: unknown, options: { where: { tokenHash: string } }): Promise<PasswordResetToken | null> {
    return this.tokens.find((token) => token.tokenHash === options.where.tokenHash) ?? null;
  }

  async insert(_entity: unknown, row: Omit<PasswordResetToken, 'resetTokenId'>): Promise<void> {
    this.nextId += 1;
    this.tokens.push({ resetTokenId: `token-row-${this.nextId}`, ...row });
  }

  async delete(_entity: unknown, criteria: Partial<PasswordResetToken>): Promise<void> {
    const matches = (token: PasswordResetToken) =>
      Object.entries(criteria).every(([key, value]) => token[key as keyof PasswordResetToken] === value);
    this.tokens = this.tokens.filter((token) => !matches(token));
  }

  async update(_entity: unknown, criteria: { userId: string }, changes: { passwordHash: string }): Promise<void> {
    this.passwordHashes.set(criteria.userId, changes.passwordHash);
  }
}

describe('PasswordResetService', () => {
  let manager: InMemoryManager;
  let delivery: InMemoryDelivery;
  let userService: { findByEmail: jest.Mock };
  let refreshTokens: { revokeAllForUser: jest.Mock };
  let service: PasswordResetService;

  const requestLink = async () => {
    await service.requestReset(user.email);
    return delivery.lastToken();
  };

  beforeEach(() => {
    delete process.env.PASSWORD_RESET_URL;
    manager = new InMemoryManager();
    delivery = new InMemoryDelivery();
    userService = { findByEmail: jest.fn(async (email: string) => (email === user.email ? user : null)) };
    refreshTokens = { revokeAllForUser: jest.fn() };
    const dataSource = { transaction: jest.fn(async (work: (m: InMemoryManager) => Promise<void>) => work(manager)) };
    const encoder = { encode: jest.fn((raw: string) => `encoded:${raw}`) };

    service = new PasswordResetService(
      dataSource as unknown as DataSource,
      userService as unknown as UserService,
      encoder as unknown as PasswordEncoderService,
      refreshTokens as unknown as RefreshTokenService,
      delivery,
    );
  });

  describe('requestReset', () => {
    it('sends a link for a registered email and stores only the SHA-256 hash of its token', async () => {
      const rawToken = await requestLink();

      expect(delivery.sent).toHaveLength(1);
      expect(delivery.sent[0].email).toBe(user.email);
      expect(Buffer.from(rawToken, 'base64url')).toHaveLength(32);
      expect(manager.tokens).toHaveLength(1);
      expect(manager.tokens[0].tokenHash).toBe(hashResetToken(rawToken));
      expect(manager.tokens[0].tokenHash).not.toContain(rawToken);
    });

    it('expires the token 20 minutes after it is issued', async () => {
      await requestLink();

      const { createdAt, expiresAt } = manager.tokens[0];
      expect(expiresAt.getTime() - createdAt.getTime()).toBe(RESET_TOKEN_TTL_MINUTES * 60 * 1000);
    });

    it('points the link at PASSWORD_RESET_URL', async () => {
      process.env.PASSWORD_RESET_URL = 'https://trade.example.com/reset';

      await requestLink();

      expect(delivery.sent[0].resetLink).toMatch(/^https:\/\/trade\.example\.com\/reset\?token=/);
    });

    it('does nothing for an unknown email and still resolves the same way', async () => {
      await expect(service.requestReset('nobody@example.com')).resolves.toBeUndefined();

      expect(delivery.sent).toHaveLength(0);
      expect(manager.tokens).toHaveLength(0);
    });

    it('replaces the earlier token, so only the newest link works', async () => {
      const firstToken = await requestLink();
      const secondToken = await requestLink();

      expect(manager.tokens).toHaveLength(1);
      await expect(service.resetPassword(firstToken, 'brand-new-password')).rejects.toThrow(InvalidPasswordResetTokenException);
      await expect(service.resetPassword(secondToken, 'brand-new-password')).resolves.toBeUndefined();
    });

    it('swallows a failed delivery and logs neither the link nor the address', async () => {
      const errorLog = jest.spyOn(Logger.prototype, 'error').mockReturnValue(undefined);
      const links: string[] = [];
      jest.spyOn(delivery, 'send').mockImplementation(async (_email, resetLink) => {
        links.push(resetLink);
        throw new Error(`smtp down for ${resetLink}`);
      });

      await expect(service.requestReset(user.email)).resolves.toBeUndefined();

      const logged = errorLog.mock.calls.flat().join(' ');
      expect(logged).toContain('Password reset delivery failed');
      expect(logged).not.toContain(new URL(links[0]).searchParams.get('token'));
      expect(logged).not.toContain(user.email);
      errorLog.mockRestore();
    });
  });

  describe('resetPassword', () => {
    it('stores the encoded new password, burns the token and revokes every session', async () => {
      const rawToken = await requestLink();

      await service.resetPassword(rawToken, 'brand-new-password');

      expect(manager.passwordHashes.get(user.userId)).toBe('encoded:brand-new-password');
      expect(manager.tokens).toHaveLength(0);
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(user.userId, manager);
    });

    it('locks the token row while it is used', async () => {
      const rawToken = await requestLink();
      const findOne = jest.spyOn(manager, 'findOne');

      await service.resetPassword(rawToken, 'brand-new-password');

      expect(findOne).toHaveBeenCalledWith(PasswordResetToken, {
        where: { tokenHash: hashResetToken(rawToken) },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('rejects a token that was already used', async () => {
      const rawToken = await requestLink();
      await service.resetPassword(rawToken, 'brand-new-password');

      await expect(service.resetPassword(rawToken, 'another-password')).rejects.toThrow(InvalidPasswordResetTokenException);
      expect(manager.passwordHashes.get(user.userId)).toBe('encoded:brand-new-password');
    });

    it('rejects an expired token and leaves the password unchanged', async () => {
      const rawToken = await requestLink();
      manager.tokens[0].expiresAt = new Date(Date.now() - 1000);

      await expect(service.resetPassword(rawToken, 'brand-new-password')).rejects.toThrow(InvalidPasswordResetTokenException);
      expect(manager.passwordHashes.size).toBe(0);
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      await expect(service.resetPassword('never-issued-value', 'brand-new-password')).rejects.toThrow(
        InvalidPasswordResetTokenException,
      );
      expect(manager.passwordHashes.size).toBe(0);
    });
  });
});
