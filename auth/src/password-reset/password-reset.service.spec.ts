import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PasswordResetService, RESET_TOKEN_TTL_MINUTES, hashResetToken } from './password-reset.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { InvalidPasswordResetTokenException } from './invalid-password-reset-token.exception';
import { MailDelivery, MailMessage } from '../mail/mail-message';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { RefreshTokenService } from '../security/refresh-token.service';

const user = { userId: '11111111-1111-1111-1111-111111111111', email: 'trader@example.com' };

/** Records each email instead of sending it, noting whether the DB transaction had committed. */
class InMemoryMailbox implements MailDelivery {
  readonly sent: (MailMessage & { afterCommit: boolean })[] = [];

  constructor(private readonly committed: () => boolean) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push({ ...message, afterCommit: this.committed() });
  }

  subjects(): string[] {
    return this.sent.map((message) => message.subject);
  }

  /** The token from the newest reset link. */
  lastToken(): string {
    const link = /https?:\/\/\S+/.exec(this.sent.at(-1)?.body ?? '')?.[0] ?? 'http://invalid/';
    return new URL(link).searchParams.get('token') ?? '';
  }
}

/** Just enough of an EntityManager for the reset flow: token rows, one user and their password. */
class InMemoryManager {
  tokens: PasswordResetToken[] = [];
  readonly passwordHashes = new Map<string, string>();
  readonly passwordChanges = new Map<string, { passwordChangedAt?: Date; passwordExpiryWarnedAt?: Date | null }>();
  private nextId = 0;

  async findOne(entity: unknown, options: { where: { tokenHash?: string; userId?: string } }): Promise<unknown> {
    if (entity === User) {
      return options.where.userId === user.userId ? user : null;
    }
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

  async update(_entity: unknown, criteria: { userId: string }, changes: { passwordHash: string; passwordChangedAt?: Date; passwordExpiryWarnedAt?: Date | null }): Promise<void> {
    this.passwordHashes.set(criteria.userId, changes.passwordHash);
    this.passwordChanges.set(criteria.userId, { passwordChangedAt: changes.passwordChangedAt, passwordExpiryWarnedAt: changes.passwordExpiryWarnedAt });
  }
}

describe('PasswordResetService', () => {
  let manager: InMemoryManager;
  let mailbox: InMemoryMailbox;
  let inTransaction: boolean;
  let userService: { findByEmail: jest.Mock };
  let refreshTokens: { revokeAllForUser: jest.Mock };
  let service: PasswordResetService;

  const requestLink = async () => {
    await service.requestReset(user.email);
    return mailbox.lastToken();
  };

  beforeEach(() => {
    delete process.env.PASSWORD_RESET_URL;
    manager = new InMemoryManager();
    inTransaction = false;
    mailbox = new InMemoryMailbox(() => !inTransaction);
    userService = { findByEmail: jest.fn(async (email: string) => (email === user.email ? user : null)) };
    refreshTokens = { revokeAllForUser: jest.fn() };
    const dataSource = {
      transaction: jest.fn(async (work: (m: InMemoryManager) => Promise<unknown>) => {
        inTransaction = true;
        try {
          return await work(manager);
        } finally {
          inTransaction = false;
        }
      }),
    };
    const encoder = { encode: jest.fn((raw: string) => `encoded:${raw}`) };

    service = new PasswordResetService(
      dataSource as unknown as DataSource,
      userService as unknown as UserService,
      encoder as unknown as PasswordEncoderService,
      refreshTokens as unknown as RefreshTokenService,
      mailbox,
    );
  });

  describe('requestReset', () => {
    it('emails a link for a registered email and stores only the SHA-256 hash of its token', async () => {
      const rawToken = await requestLink();

      expect(mailbox.sent).toHaveLength(1);
      expect(mailbox.sent[0]).toMatchObject({ to: user.email, subject: 'Reset your NextTrade password' });
      expect(Buffer.from(rawToken, 'base64url')).toHaveLength(32);
      expect(manager.tokens).toHaveLength(1);
      expect(manager.tokens[0].tokenHash).toBe(hashResetToken(rawToken));
      expect(manager.tokens[0].tokenHash).not.toContain(rawToken);
    });

    it('an expired password gets the expired-password wording with the same kind of link', async () => {
      await service.requestReset(user.email, { expired: true });
      expect(mailbox.sent[0]).toMatchObject({ to: user.email, subject: 'Your NextTrade password has expired' });
      expect(mailbox.sent[0].body).toContain('sign-in was refused');
      expect(manager.tokens).toHaveLength(1);
      expect(manager.tokens[0].tokenHash).toBe(hashResetToken(mailbox.lastToken()));
    });

    it('sends the email only after the token is committed', async () => {
      await requestLink();

      expect(mailbox.sent[0].afterCommit).toBe(true);
    });

    it('expires the token 20 minutes after it is issued and says so in the email', async () => {
      await requestLink();

      const { createdAt, expiresAt } = manager.tokens[0];
      expect(expiresAt.getTime() - createdAt.getTime()).toBe(RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      expect(mailbox.sent[0].body).toContain('expires in 20 minutes');
    });

    it('points the link at PASSWORD_RESET_URL', async () => {
      process.env.PASSWORD_RESET_URL = 'http://localhost:4300/reset-password';

      await requestLink();

      expect(mailbox.sent[0].body).toMatch(/http:\/\/localhost:4300\/reset-password\?token=\S+/);
    });

    it('does nothing for an unknown email and still resolves the same way', async () => {
      await expect(service.requestReset('nobody@example.com')).resolves.toBeUndefined();

      expect(mailbox.sent).toHaveLength(0);
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
      const bodies: string[] = [];
      jest.spyOn(mailbox, 'send').mockImplementation(async (message) => {
        bodies.push(message.body);
        throw new Error(`smtp down for ${message.to}: ${message.body}`);
      });

      await expect(service.requestReset(user.email)).resolves.toBeUndefined();

      const logged = errorLog.mock.calls.flat().join(' ');
      expect(logged).toContain('Email delivery failed');
      expect(logged).not.toContain(manager.tokens[0].tokenHash);
      expect(bodies[0]).toContain('token=');
      expect(logged).not.toContain('token=');
      expect(logged).not.toContain(user.email);
      errorLog.mockRestore();
    });
  });

  describe('resetPassword', () => {
    it('stores the encoded new password, burns the token and revokes every session', async () => {
      const rawToken = await requestLink();

      await service.resetPassword(rawToken, 'brand-new-password');

      expect(manager.passwordHashes.get(user.userId)).toBe('encoded:brand-new-password');
      expect(manager.passwordChanges.get(user.userId)?.passwordChangedAt).toBeInstanceOf(Date);
      expect(manager.passwordChanges.get(user.userId)?.passwordExpiryWarnedAt).toBeNull();
      expect(manager.tokens).toHaveLength(0);
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(user.userId, manager);
    });

    it('sends a password-changed notice to the account owner after the commit', async () => {
      const rawToken = await requestLink();

      await service.resetPassword(rawToken, 'brand-new-password');

      expect(mailbox.subjects()).toEqual(['Reset your NextTrade password', 'Your NextTrade password was changed']);
      expect(mailbox.sent[1]).toMatchObject({ to: user.email, afterCommit: true });
      expect(mailbox.sent[1].body).toContain('signed out on every device');
    });

    it('still completes the reset when the notice cannot be sent', async () => {
      const errorLog = jest.spyOn(Logger.prototype, 'error').mockReturnValue(undefined);
      const rawToken = await requestLink();
      jest.spyOn(mailbox, 'send').mockRejectedValue(new Error('smtp down'));

      await expect(service.resetPassword(rawToken, 'brand-new-password')).resolves.toBeUndefined();

      expect(manager.passwordHashes.get(user.userId)).toBe('encoded:brand-new-password');
      expect(errorLog).toHaveBeenCalledWith('Email delivery failed errorType=Error');
      errorLog.mockRestore();
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

    it('rejects a token that was already used, and sends no second notice', async () => {
      const rawToken = await requestLink();
      await service.resetPassword(rawToken, 'brand-new-password');

      await expect(service.resetPassword(rawToken, 'another-password')).rejects.toThrow(InvalidPasswordResetTokenException);
      expect(manager.passwordHashes.get(user.userId)).toBe('encoded:brand-new-password');
      expect(mailbox.sent).toHaveLength(2);
    });

    it('rejects an expired token, leaves the password unchanged and sends nothing', async () => {
      const rawToken = await requestLink();
      manager.tokens[0].expiresAt = new Date(Date.now() - 1000);

      await expect(service.resetPassword(rawToken, 'brand-new-password')).rejects.toThrow(InvalidPasswordResetTokenException);
      expect(manager.passwordHashes.size).toBe(0);
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
      expect(mailbox.sent).toHaveLength(1);
    });

    it('rejects an unknown token', async () => {
      await expect(service.resetPassword('never-issued-value', 'brand-new-password')).rejects.toThrow(
        InvalidPasswordResetTokenException,
      );
      expect(manager.passwordHashes.size).toBe(0);
      expect(mailbox.sent).toHaveLength(0);
    });
  });
});
