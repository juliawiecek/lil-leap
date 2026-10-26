import { DataSource } from 'typeorm';
import { PasswordExpiryEvent, PasswordExpiryService } from './password-expiry.service';
import { passwordExpiredResetEmail, passwordExpiringSoonNotice } from './password-expiry-emails';
import { MailDelivery, MailMessage } from '../mail/mail-message';
import { PasswordResetService } from '../password-reset/password-reset.service';
import {
  PASSWORD_EXPIRY_WARNING_DAYS, PASSWORD_MAX_AGE_DAYS, daysUntilExpiry, passwordExpired, passwordExpiresAt,
} from '../security/password-policy';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-26T09:00:00Z');

interface Row { user_id: string; email: string; user_status: string; password_changed_at: Date; password_expiry_warned_at: Date | null }

/** Enough of the users table for the sweep: the claim query is replayed in JavaScript with the same conditions. */
class FakeUsers {
  rows: Row[] = [];
  audit: { userId: string; eventType: string; payload: unknown }[] = [];
  committed = false;

  async query(sql: string, params: unknown[]): Promise<unknown> {
    if (sql.includes('UPDATE users')) {
      const [now, warnAfterDays, maxAgeDays] = params as [Date, number, number];
      const claimed = this.rows.filter((row) =>
        row.user_status === 'ACTIVE'
        && row.password_changed_at.getTime() <= now.getTime() - warnAfterDays * DAY
        && row.password_changed_at.getTime() > now.getTime() - maxAgeDays * DAY
        && (!row.password_expiry_warned_at || row.password_expiry_warned_at < row.password_changed_at));
      claimed.forEach((row) => { row.password_expiry_warned_at = now; });
      return claimed.map(({ user_id, email, password_changed_at }) => ({ user_id, email, password_changed_at }));
    }
    if (sql.includes('INSERT INTO audit_log')) {
      const [userId, eventType, payload] = params as [string, string, string | undefined];
      this.audit.push({ userId, eventType, payload: payload ? JSON.parse(payload) : {} });
      return undefined;
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

describe('PasswordExpiryService', () => {
  let users: FakeUsers;
  let sent: (MailMessage & { afterCommit: boolean })[];
  let passwordReset: { requestReset: jest.Mock };
  let service: PasswordExpiryService;
  const ageDays = (days: number) => new Date(NOW.getTime() - days * DAY);

  beforeEach(() => {
    users = new FakeUsers();
    sent = [];
    const mail: MailDelivery = { send: async (message) => { sent.push({ ...message, afterCommit: users.committed }); } };
    const dataSource = {
      query: (sql: string, params: unknown[]) => users.query(sql, params),
      transaction: async (work: (manager: FakeUsers) => Promise<unknown>) => {
        users.committed = false;
        const result = await work(users);
        users.committed = true;
        return result;
      },
    };
    passwordReset = { requestReset: jest.fn() };
    service = new PasswordExpiryService(dataSource as unknown as DataSource, passwordReset as unknown as PasswordResetService, mail);
  });

  it('policy: 90-day maximum age, warned 14 days ahead, by default', () => {
    expect(PASSWORD_MAX_AGE_DAYS).toBe(90);
    expect(PASSWORD_EXPIRY_WARNING_DAYS).toBe(14);
    const changed = new Date('2026-01-01T00:00:00Z');
    expect(passwordExpiresAt(changed)).toEqual(new Date('2026-04-01T00:00:00Z'));
    expect(passwordExpired(changed, new Date('2026-03-31T23:59:59Z'))).toBe(false);
    expect(passwordExpired(changed, new Date('2026-04-01T00:00:00Z'))).toBe(true);
    expect(passwordExpired(null)).toBe(false);
    expect(daysUntilExpiry(changed, new Date('2026-03-18T12:00:00Z'))).toBe(14);
    expect(daysUntilExpiry(changed, new Date('2026-05-01T00:00:00Z'))).toBe(0);
  });

  it('warns each user once when their password enters the window, after the commit, and audits it', async () => {
    users.rows = [
      { user_id: 'u-fresh', email: 'fresh@example.com', user_status: 'ACTIVE', password_changed_at: ageDays(10), password_expiry_warned_at: null },
      { user_id: 'u-soon', email: 'soon@example.com', user_status: 'ACTIVE', password_changed_at: ageDays(80), password_expiry_warned_at: null },
      { user_id: 'u-edge', email: 'edge@example.com', user_status: 'ACTIVE', password_changed_at: ageDays(76), password_expiry_warned_at: null },
      { user_id: 'u-old', email: 'old@example.com', user_status: 'ACTIVE', password_changed_at: ageDays(91), password_expiry_warned_at: null },
      { user_id: 'u-off', email: 'off@example.com', user_status: 'DISABLED', password_changed_at: ageDays(80), password_expiry_warned_at: null },
    ];

    await expect(service.warnExpiringSoon(NOW)).resolves.toBe(2);

    expect(sent.map((m) => m.to).sort()).toEqual(['edge@example.com', 'soon@example.com']);
    expect(sent.every((m) => m.afterCommit)).toBe(true);
    const soon = sent.find((m) => m.to === 'soon@example.com')!;
    expect(soon.subject).toBe('Your NextTrade password expires in 10 days');
    expect(soon.body).toContain(passwordExpiresAt(ageDays(80)).toUTCString());
    expect(soon.body).toContain('Change password');
    expect(users.audit).toEqual([
      { userId: 'u-soon', eventType: PasswordExpiryEvent.WARNED, payload: { expiresAt: passwordExpiresAt(ageDays(80)).toISOString() } },
      { userId: 'u-edge', eventType: PasswordExpiryEvent.WARNED, payload: { expiresAt: passwordExpiresAt(ageDays(76)).toISOString() } },
    ]);

    // The next sweep finds nobody new: already warned, too fresh, already expired or not active.
    await expect(service.warnExpiringSoon(new Date(NOW.getTime() + 60 * 60 * 1000))).resolves.toBe(0);
    expect(sent).toHaveLength(2);
  });

  it('a changed password earns a fresh warning later, because the old warning predates it', async () => {
    users.rows = [{ user_id: 'u1', email: 'me@example.com', user_status: 'ACTIVE', password_changed_at: ageDays(80), password_expiry_warned_at: null }];
    await service.warnExpiringSoon(NOW);
    users.rows[0].password_changed_at = new Date(NOW.getTime() + DAY); // changed the day after the warning
    const later = new Date(NOW.getTime() + 78 * DAY);
    await expect(service.warnExpiringSoon(later)).resolves.toBe(1);
    expect(sent).toHaveLength(2);
  });

  it('a failed email is logged, not thrown, and the user stays claimed', async () => {
    const failing: MailDelivery = { send: async () => { throw new Error('smtp down'); } };
    const dataSource = { transaction: async (work: (m: FakeUsers) => Promise<unknown>) => work(users) };
    const quiet = new PasswordExpiryService(dataSource as unknown as DataSource, passwordReset as unknown as PasswordResetService, failing);
    users.rows = [{ user_id: 'u1', email: 'me@example.com', user_status: 'ACTIVE', password_changed_at: ageDays(80), password_expiry_warned_at: null }];
    await expect(quiet.warnExpiringSoon(NOW)).resolves.toBe(1);
    expect(users.rows[0].password_expiry_warned_at).toEqual(NOW);
  });

  it('an expired sign-in is audited and gets the expired-password reset link, and never throws', async () => {
    await service.handleExpiredSignIn('u1', 'me@example.com');
    expect(users.audit).toEqual([{ userId: 'u1', eventType: PasswordExpiryEvent.EXPIRED_SIGN_IN, payload: {} }]);
    expect(passwordReset.requestReset).toHaveBeenCalledWith('me@example.com', { expired: true });

    passwordReset.requestReset.mockRejectedValue(new Error('db down'));
    await expect(service.handleExpiredSignIn('u1', 'me@example.com')).resolves.toBeUndefined();
  });

  it('the sweep runs at start-up and then on its interval, and stops with the module', () => {
    jest.useFakeTimers();
    const sweep = jest.spyOn(service, 'warnExpiringSoon').mockResolvedValue(0);
    service.onModuleInit();
    expect(sweep).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('a sweep failure is logged and the timer keeps going', async () => {
    jest.useFakeTimers();
    const sweep = jest.spyOn(service, 'warnExpiringSoon').mockRejectedValue(new Error('db down'));
    service.onModuleInit();
    await Promise.resolve();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('emails never contain a line break in their headers and the expired notice carries the link', () => {
    const notice = passwordExpiringSoonNotice('a@example.com', new Date('2026-11-09T09:00:00Z'), 1);
    expect(notice.subject).toBe('Your NextTrade password expires tomorrow');
    expect(passwordExpiringSoonNotice('a@example.com', NOW, 0).subject).toBe('Your NextTrade password expires today');
    const expired = passwordExpiredResetEmail('a@example.com', 'http://localhost:4200/reset-password?token=abc', 20);
    expect(expired.subject).toBe('Your NextTrade password has expired');
    expect(expired.body).toContain('http://localhost:4200/reset-password?token=abc');
    expect(expired.body).toContain('20 minutes');
  });
});
