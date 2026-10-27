import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountSettingsService, AuditEvent } from './account-settings.service';
import { User } from '../user/entities/user.entity';
import { CustomerProfile } from '../onboarding/entities/customer-profile.entity';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { MailDelivery, MailMessage } from '../mail/mail-message';
import { IncorrectPasswordException } from '../user/exceptions/incorrect-password.exception';
import { EmailInUseException } from '../user/exceptions/email-in-use.exception';
import { ProfileNotFoundException } from '../user/exceptions/profile-not-found.exception';

const CURRENT = 'current-password-1';
const ME = 'user-me';
const OTHER = 'user-other';

/** Plain-text "hashes" are enough here: the encoder is not what these tests are about. */
const encoder = {
  encode: (raw: string) => `hash:${raw}`,
  matches: (raw: string, hash: string) => hash === `hash:${raw}`,
} as unknown as PasswordEncoderService;

interface Row {
  userId: string;
  email: string;
  passwordHash: string;
  userRole: 'TRADER';
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/**
 * Just enough of a database for the settings flows: users, one profile, open sessions and the audit
 * log. A transaction works on a copy that is only kept when the callback returns, like a real rollback.
 */
class FakeDatabase {
  users: Row[] = [
    { userId: ME, email: 'me@example.com', passwordHash: `hash:${CURRENT}`, userRole: 'TRADER', failedLoginAttempts: 0, lockedUntil: null },
    { userId: OTHER, email: 'taken@example.com', passwordHash: 'hash:x', userRole: 'TRADER', failedLoginAttempts: 0, lockedUntil: null },
  ];
  profile = { firstName: 'Ada', lastName: 'Lovelace', address: '1 Old Street', phone: '312-555-0100', user: { userId: ME, email: 'me@example.com' } };
  openSessions = new Set(['me-laptop', 'me-phone', 'other-laptop']);
  audit: { userId: string; eventType: string; payload: Record<string, unknown> }[] = [];

  snapshot() {
    return JSON.stringify({ users: this.users, profile: this.profile, sessions: [...this.openSessions], audit: this.audit });
  }

  restore(state: string) {
    const parsed = JSON.parse(state);
    this.users = parsed.users.map((user: Row) => ({ ...user, lockedUntil: user.lockedUntil ? new Date(user.lockedUntil) : null }));
    this.profile = parsed.profile;
    this.openSessions = new Set(parsed.sessions);
    this.audit = parsed.audit;
  }

  manager() {
    const db = this;
    let where: Record<string, string> = {};
    let profileChanges: Record<string, string> = {};
    const builder = {
      where: (_sql: string, params: Record<string, string>) => ((where = params), builder),
      setLock: () => builder,
      getOne: async () =>
        db.users.find((user) => (where.userId ? user.userId === where.userId : user.email === where.email)) ?? null,
      update: () => builder,
      set: (changes: Record<string, string>) => ((profileChanges = changes), builder),
      execute: async () => Object.assign(db.profile, profileChanges),
    };
    return {
      createQueryBuilder: () => builder,
      findOne: async (entity: unknown, options: { where: { user: { userId: string } } }) =>
        entity === CustomerProfile && options.where.user.userId === ME ? { ...db.profile } : null,
      update: async (entity: unknown, criteria: { userId: string }, changes: Partial<Row>) => {
        if (entity === User) {
          Object.assign(db.users.find((user) => user.userId === criteria.userId)!, changes);
        }
      },
      query: async (_sql: string, [userId, eventType, payload]: [string, string, string]) => {
        db.audit.push({ userId, eventType, payload: JSON.parse(payload) });
      },
    };
  }

  me(): Row {
    return this.users.find((user) => user.userId === ME)!;
  }
}

describe('AccountSettingsService (PS-07)', () => {
  let db: FakeDatabase;
  let sent: MailMessage[];
  let service: AccountSettingsService;

  beforeEach(() => {
    db = new FakeDatabase();
    sent = [];
    const dataSource = {
      transaction: async (work: (manager: unknown) => Promise<unknown>) => {
        const before = db.snapshot();
        try {
          return await work(db.manager());
        } catch (error) {
          db.restore(before);
          throw error;
        }
      },
    } as unknown as DataSource;
    const refreshTokens = {
      revokeAllForUser: async (userId: string) => {
        for (const session of [...db.openSessions]) {
          if (session.startsWith(userId === ME ? 'me-' : 'other-')) db.openSessions.delete(session);
        }
      },
    } as unknown as RefreshTokenService;
    const mail: MailDelivery = { send: async (message) => void sent.push(message) };
    service = new AccountSettingsService(dataSource, encoder, refreshTokens, mail);
  });

  describe('contact details', () => {
    it('saves a new address and phone and audits which fields changed, not their values', async () => {
      const profile = await service.updateProfile(ME, { address: '2 New Road, Chicago, IL', phone: '+1-312-555-0199' });

      expect(profile.address).toBe('2 New Road, Chicago, IL');
      expect(db.profile.phone).toBe('+1-312-555-0199');
      expect(db.audit).toEqual([{ userId: ME, eventType: AuditEvent.PROFILE_UPDATED, payload: { fields: ['address', 'phone'] } }]);
      expect(JSON.stringify(db.audit)).not.toContain('New Road');
    });

    it('writes nothing when the values are unchanged', async () => {
      await service.updateProfile(ME, { phone: '312-555-0100' });
      expect(db.audit).toEqual([]);
    });

    it('rejects an empty request and a phone with too few digits', async () => {
      await expect(service.updateProfile(ME, {})).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateProfile(ME, { phone: '(12) 34-5' })).rejects.toBeInstanceOf(BadRequestException);
      expect(db.profile.phone).toBe('312-555-0100');
    });

    it('answers 404 for a caller without a contact profile', async () => {
      await expect(service.updateProfile(OTHER, { phone: '312-555-0101' })).rejects.toBeInstanceOf(ProfileNotFoundException);
    });
  });

  describe('email', () => {
    it('changes the email after checking the current password, audits it and tells both addresses', async () => {
      const user = await service.changeEmail(ME, '  New@Example.com ', CURRENT);

      expect(user.email).toBe('new@example.com');
      expect(db.me().email).toBe('new@example.com');
      expect(db.audit).toEqual([{ userId: ME, eventType: AuditEvent.EMAIL_CHANGED, payload: {} }]);
      expect(sent.map((message) => message.to)).toEqual(['me@example.com', 'new@example.com']);
      expect(sent[0].body).toContain('n***@example.com');
    });

    it('wrong current password: 401 and nothing changes', async () => {
      const before = db.me().email;
      await expect(service.changeEmail(ME, 'new@example.com', 'wrong')).rejects.toBeInstanceOf(IncorrectPasswordException);

      expect(db.me().email).toBe(before);
      expect(db.audit).toEqual([]);
      expect(sent).toEqual([]);
      expect(db.me().failedLoginAttempts).toBe(1); // counts toward the sign-in lockout
    });

    it('duplicate email: 409, compared case-insensitively, and nothing changes', async () => {
      await expect(service.changeEmail(ME, 'TAKEN@example.com', CURRENT)).rejects.toBeInstanceOf(EmailInUseException);

      expect(db.me().email).toBe('me@example.com');
      expect(db.audit).toEqual([]);
      expect(sent).toEqual([]);
    });

    it('rejects the email the account already has', async () => {
      await expect(service.changeEmail(ME, 'ME@example.com', CURRENT)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('password', () => {
    it('sets the new password, signs out every session for this user only, audits and sends a notice', async () => {
      await service.changePassword(ME, CURRENT, 'brand-new-password');

      expect(db.me().passwordHash).toBe('hash:brand-new-password');
      // The password age restarts and the next "expires soon" warning is earned again (BR-03).
      expect((db.me() as { passwordChangedAt?: Date }).passwordChangedAt).toBeInstanceOf(Date);
      expect((db.me() as { passwordExpiryWarnedAt?: Date | null }).passwordExpiryWarnedAt).toBeNull();
      expect([...db.openSessions]).toEqual(['other-laptop']);
      expect(db.audit).toEqual([{ userId: ME, eventType: AuditEvent.PASSWORD_CHANGED, payload: { otherSessionsSignedOut: true } }]);
      expect(JSON.stringify(db.audit)).not.toContain('brand-new-password');
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: 'me@example.com', subject: 'Your NextTrade password was changed' });
      expect(sent[0].body).toContain('every other device');
    });

    it('wrong current password: 401, the password and sessions stay as they were', async () => {
      await expect(service.changePassword(ME, 'wrong', 'brand-new-password')).rejects.toBeInstanceOf(IncorrectPasswordException);

      expect(db.me().passwordHash).toBe(`hash:${CURRENT}`);
      expect(db.openSessions.size).toBe(3);
      expect(db.audit).toEqual([]);
      expect(sent).toEqual([]);
    });

    it('three wrong passwords lock the account, after which even the right one is refused', async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await expect(service.changePassword(ME, 'wrong', 'brand-new-password')).rejects.toBeInstanceOf(IncorrectPasswordException);
      }
      expect(db.me().lockedUntil).not.toBeNull();
      await expect(service.changePassword(ME, CURRENT, 'brand-new-password')).rejects.toBeInstanceOf(IncorrectPasswordException);
      expect(db.me().passwordHash).toBe(`hash:${CURRENT}`);
    });

    it('a correct password clears earlier failures', async () => {
      await expect(service.changePassword(ME, 'wrong', 'x-new-password')).rejects.toBeInstanceOf(IncorrectPasswordException);
      await service.changePassword(ME, CURRENT, 'brand-new-password');
      expect(db.me().failedLoginAttempts).toBe(0);
    });

    it('a failed notice email does not fail the change', async () => {
      const failing = new AccountSettingsService(
        { transaction: async (work: (manager: unknown) => Promise<unknown>) => work(db.manager()) } as unknown as DataSource,
        encoder,
        { revokeAllForUser: async () => undefined } as unknown as RefreshTokenService,
        { send: async () => { throw new Error('smtp down'); } },
      );
      await expect(failing.changePassword(ME, CURRENT, 'brand-new-password')).resolves.toMatchObject({ userId: ME });
    });
  });
});
