import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { tlsKeystorePath } from '../src/security/tls';
import { MAIL_DELIVERY, MailDelivery, MailMessage } from '../src/mail/mail-message';
import { hashResetToken } from '../src/password-reset/password-reset.service';

/**
 * Full register -> login -> refresh -> logout flow against a real Postgres with
 * db/finalized-schema.sql and db/init-app-role.sh applied, served over HTTPS
 * (SecureTransportMiddleware rejects plaintext). See README "End-to-end tests".
 */
describe('auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const runId = Date.now();
  const traderEmail = `e2e-trader-${runId}@example.com`;
  const analystEmail = `e2e-analyst-${runId}@example.com`;
  const password = 'correct-horse-battery';

  /** Captures emails instead of writing .eml files; resetLinks holds the link from each reset email. */
  const sentEmails: MailMessage[] = [];
  const resetLinks: string[] = [];
  const outbox: MailDelivery = {
    send: async (message) => {
      sentEmails.push(message);
      const link = /https?:\/\/\S+/.exec(message.body)?.[0];
      if (link) {
        resetLinks.push(link);
      }
    },
  };

  const post = (path: string, body?: object) =>
    request(app.getHttpServer()).post(path).disableTLSCerts().send(body);
  const get = (path: string) => request(app.getHttpServer()).get(path).disableTLSCerts();

  const login = async () => {
    const res = await post('/auth/login', { email: traderEmail, password }).expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  };

  beforeAll(async () => {
    const keystore = tlsKeystorePath();
    if (!keystore) {
      throw new Error('TLS_KEYSTORE must point to a PKCS12 keystore for the e2e run.');
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_DELIVERY)
      .useValue(outbox)
      .compile();
    app = moduleRef.createNestApplication({
      httpsOptions: { pfx: fs.readFileSync(keystore), passphrase: process.env.TLS_KEYSTORE_PASSWORD ?? '' },
    });
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource) {
      const users = `(SELECT user_id FROM users WHERE email IN ($1, $2))`;
      for (const table of ['sessions', 'password_reset_tokens', 'accounts', 'financial_profiles', 'customer_profiles', 'analyst_profiles']) {
        await dataSource.query(`DELETE FROM ${table} WHERE user_id IN ${users}`, [traderEmail, analystEmail]);
      }
      await dataSource.query('DELETE FROM users WHERE email IN ($1, $2)', [traderEmail, analystEmail]);
    }
    await app?.close();
  });

  it('serves health over HTTPS', async () => {
    const res = await request(app.getHttpServer()).get('/health').disableTLSCerts().expect(200);
    expect(res.body.status).toBe('ok');
  });

  describe('register', () => {
    it('creates a TRADER with profile, financial profile, and a server-assigned account tier -- no tokens', async () => {
      const res = await post('/auth/register', {
        user_role: 'TRADER',
        email: traderEmail.toUpperCase(),
        password,
        first_name: 'Ada',
        last_name: 'Lovelace',
        date_of_birth: '1990-12-10',
        phone: '555-0100',
        street_address: '1 Main St',
        apartment: ' ',
        city: 'Springfield',
        state_province: 'IL',
        postal_code: '62701',
        country: 'US',
        citizenship_status: 'CITIZEN',
        ssn: '123-45-6789',
        employment_status: 'RETIRED',
        annual_income: '50,000',
        net_worth_bracket: '$25k-100k',
        risk_profile: 'MODERATE',
        liquidity_position: '10,000',
        accredited_investor: false,
        is_politically_exposed_person: false,
        broker_affiliation: true,
        broker_firm_name: 'Quote "Firm"',
        broker_affiliation_details: 'line one\nline two',
        account_name: 'Main',
        account_type: 'INDIVIDUAL_CASH',
        trader_level: 'ADVANCED', // ignored: $25k-100k + 10% of 50,000 = 30,000 capacity -> NOVICE
      }).expect(201);

      expect(res.body).toMatchObject({ email: traderEmail, userRole: 'TRADER' });
      expect(res.body.accessToken).toBeUndefined();

      const [row] = await dataSource.query(
        `SELECT cp.address, jsonb_typeof(fp.regulatory_disclosures) AS disclosures_type, fp.regulatory_disclosures, fp.annual_income, a.trader_level, a.min_balance_requirement
           FROM users u
           JOIN customer_profiles cp USING (user_id)
           JOIN financial_profiles fp USING (user_id)
           JOIN accounts a USING (user_id)
          WHERE u.email = $1`,
        [traderEmail],
      );
      expect(row.address).toBe('1 Main St, Springfield, IL, 62701');
      expect(row.disclosures_type).toBe('object'); // Insights' PostgresContractTest relies on this
      expect(row.regulatory_disclosures).toMatchObject({
        brokerAffiliation: true,
        brokerFirmName: 'Quote "Firm"',
        brokerAffiliationDetails: 'line one\nline two',
      });
      expect(Number(row.annual_income)).toBe(50000);
      expect(row.trader_level).toBe('NOVICE');
      expect(Number(row.min_balance_requirement)).toBe(5000);
    });

    it('rejects a TRADER below $5,000 capacity with 422 and creates nothing', async () => {
      const brokeEmail = `e2e-broke-${runId}@example.com`;
      const res = await post('/auth/register', {
        user_role: 'TRADER',
        email: brokeEmail,
        password,
        first_name: 'Bo',
        last_name: 'Broke',
        date_of_birth: '1990-12-10',
        phone: '555-0101',
        street_address: '2 Main St',
        city: 'Springfield',
        state_province: 'IL',
        postal_code: '62701',
        country: 'US',
        citizenship_status: 'CITIZEN',
        ssn: '123-45-6780',
        employment_status: 'UNEMPLOYED',
        annual_income: '0',
        net_worth_bracket: '$0-5k',
        risk_profile: 'CONSERVATIVE',
        liquidity_position: '0',
        accredited_investor: false,
        is_politically_exposed_person: false,
        account_name: 'Main',
        account_type: 'INDIVIDUAL_CASH',
        trader_level: 'ADVANCED',
      }).expect(422);

      expect(res.body).toEqual({
        error: 'INSUFFICIENT_INVESTABLE_ASSETS',
        message: 'A minimum of $5,000 in investable assets is required',
      });
      const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM users WHERE email = $1', [brokeEmail]);
      expect(count).toBe(0);
    });

    it('creates an ANALYST', async () => {
      await post('/auth/register', { user_role: 'ANALYST', email: analystEmail, password, employee_id: 'E-1' }).expect(201);
    });

    it('rejects a duplicate email regardless of case', async () => {
      const res = await post('/auth/register', {
        user_role: 'ANALYST',
        email: analystEmail.toUpperCase(),
        password,
        employee_id: 'E-2',
      }).expect(409);
      expect(res.body.error).toBe('USER_ALREADY_EXISTS');
    });
  });

  describe('login', () => {
    it('issues a verifiable access token and a refresh token', async () => {
      const { accessToken, refreshToken } = await login();

      const claims = jwt.verify(accessToken, process.env.APP_JWT_SECRET as string) as jwt.JwtPayload;
      expect(claims.email).toBe(traderEmail);
      expect(claims.trader_level).toBe('NOVICE');
      expect(refreshToken).toEqual(expect.any(String));
    });

    it('fails identically for a wrong password and an unknown email', async () => {
      const wrongPassword = await post('/auth/login', { email: traderEmail, password: 'nope-nope-nope' }).expect(401);
      const unknownEmail = await post('/auth/login', { email: 'nobody@example.com', password }).expect(401);

      expect(wrongPassword.body).toEqual({ error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password, or sign-in is locked. After 3 failed attempts, wait 15 minutes and try again.' });
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });
  });

  describe('GET /rules/tier-eligibility', () => {
    it('returns the tier, balance and gap to the next tier for the caller', async () => {
      const { accessToken } = await login();

      const res = await get('/rules/tier-eligibility').set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(res.body).toEqual({
        trader_level: 'NOVICE',
        min_balance_requirement: 5000,
        current_balance: 0,
        tier_status: 'INELIGIBLE',
        next_tier: 'ADVANCED',
        gap_to_next_tier: 100000,
      });
    });

    it('rejects a request without a valid access token', async () => {
      await get('/rules/tier-eligibility').expect(401);
      const res = await get('/rules/tier-eligibility').set('Authorization', 'Bearer not-a-jwt').expect(401);
      expect(res.body.error).toBe('INVALID_ACCESS_TOKEN');
    });

    it('404s for a user without an account', async () => {
      const res = await post('/auth/login', { email: analystEmail, password }).expect(200);

      await get('/rules/tier-eligibility').set('Authorization', `Bearer ${res.body.accessToken}`).expect(404);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and rejects the old one', async () => {
      const { refreshToken } = await login();

      const res = await post('/auth/refresh', { refreshToken }).expect(200);
      expect(res.body.refreshToken).not.toBe(refreshToken);

      const reuse = await post('/auth/refresh', { refreshToken }).expect(401);
      expect(reuse.body.error).toBe('INVALID_REFRESH_TOKEN');
    });

    it('gives each session a 10-minute inactivity window that a refresh renews (BR-03)', async () => {
      const { refreshToken } = await login();
      const rotated = (await post('/auth/refresh', { refreshToken }).expect(200)).body.refreshToken;

      const sessions = await dataSource.query(
        `SELECT extract(epoch FROM s.expires_at - s.issued_at) AS window_seconds FROM sessions s
           JOIN users u USING (user_id) WHERE u.email = $1 ORDER BY s.issued_at DESC LIMIT 2`,
        [traderEmail],
      );
      for (const session of sessions) {
        expect(Number(session.window_seconds)).toBeGreaterThan(9.9 * 60);
        expect(Number(session.window_seconds)).toBeLessThan(10.1 * 60);
      }
      expect(rotated).toEqual(expect.any(String));
    });

    it('rejects a session that has been idle past the window', async () => {
      const { refreshToken } = await login();
      // Simulate 10 idle minutes: the session's window has passed without a refresh.
      await dataSource.query(
        `UPDATE sessions SET issued_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute'
          WHERE session_id = (SELECT s.session_id FROM sessions s JOIN users u USING (user_id)
                               WHERE u.email = $1 ORDER BY s.issued_at DESC LIMIT 1)`,
        [traderEmail],
      );

      const res = await post('/auth/refresh', { refreshToken }).expect(401);
      expect(res.body.error).toBe('INVALID_REFRESH_TOKEN');
    });

    it('lets only one of two concurrent rotations of the same token succeed', async () => {
      const { refreshToken } = await login();

      const statuses = await Promise.all([1, 2].map(() => post('/auth/refresh', { refreshToken }).then((r) => r.status)));

      expect(statuses.sort()).toEqual([200, 401]);
    });
  });

  describe('logout', () => {
    it('revokes the session so its refresh token no longer works', async () => {
      const { refreshToken } = await login();

      await post('/auth/logout', { refreshToken }).expect(204);

      const [session] = await dataSource.query(
        `SELECT s.revoked_at FROM sessions s JOIN users u USING (user_id)
          WHERE u.email = $1 ORDER BY s.issued_at DESC LIMIT 1`,
        [traderEmail],
      );
      expect(session.revoked_at).not.toBeNull();

      const res = await post('/auth/refresh', { refreshToken }).expect(401);
      expect(res.body.error).toBe('INVALID_REFRESH_TOKEN');
    });

    it('only ends the session it was given', async () => {
      const laptop = await login();
      const phone = await login();

      await post('/auth/logout', { refreshToken: laptop.refreshToken }).expect(204);

      await post('/auth/refresh', { refreshToken: phone.refreshToken }).expect(200);
    });

    it('logs out a rotated-in token', async () => {
      const { refreshToken } = await login();
      const rotated = (await post('/auth/refresh', { refreshToken }).expect(200)).body.refreshToken;

      await post('/auth/logout', { refreshToken: rotated }).expect(204);

      await post('/auth/refresh', { refreshToken: rotated }).expect(401);
    });

    it('is idempotent and does not reveal whether a token was valid', async () => {
      const { refreshToken } = await login();

      await post('/auth/logout', { refreshToken }).expect(204);
      await post('/auth/logout', { refreshToken }).expect(204);
      await post('/auth/logout', { refreshToken: 'never-issued' }).expect(204);
    });

    it('rejects a request without a refresh token', async () => {
      const res = await post('/auth/logout', {}).expect(400);
      expect(res.body.error).toBe('INVALID_REQUEST');
    });
  });

  // Runs last: it changes the trader's password, which the blocks above sign in with.
  describe('password reset', () => {
    const newPassword = 'new-correct-horse-battery';
    const tokenFromLastLink = () => new URL(resetLinks.at(-1) ?? '').searchParams.get('token') ?? '';
    const requestLink = async () => {
      await post('/auth/forgot-password', { email: traderEmail }).expect(202);
      return tokenFromLastLink();
    };

    it('answers 202 for an unknown email without sending anything', async () => {
      const sentBefore = resetLinks.length;

      await post('/auth/forgot-password', { email: `nobody-${runId}@example.com` }).expect(202);

      expect(resetLinks).toHaveLength(sentBefore);
    });

    it('stores only the SHA-256 hash of the emailed token, expiring in 20 minutes', async () => {
      const token = await requestLink();

      const rows = await dataSource.query(
        `SELECT t.token_hash, EXTRACT(EPOCH FROM (t.expires_at - t.created_at)) AS ttl_seconds
           FROM password_reset_tokens t JOIN users u USING (user_id) WHERE u.email = $1`,
        [traderEmail],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toBe(hashResetToken(token));
      expect(Number(rows[0].ttl_seconds)).toBe(20 * 60);
    });

    it('rejects a new password that breaks the registration rule', async () => {
      const token = await requestLink();

      const res = await post('/auth/reset-password', { token, newPassword: 'short' }).expect(400);
      expect(res.body.error).toBe('INVALID_REQUEST');
    });

    it('rejects an expired token', async () => {
      const token = await requestLink();
      await dataSource.query(
        `UPDATE password_reset_tokens SET created_at = now() - interval '30 minutes', expires_at = now() - interval '10 minutes'
          WHERE token_hash = $1`,
        [hashResetToken(token)],
      );

      const res = await post('/auth/reset-password', { token, newPassword }).expect(400);
      expect(res.body.error).toBe('INVALID_RESET_TOKEN');
    });

    it('rejects an unknown token', async () => {
      const res = await post('/auth/reset-password', { token: 'never-issued', newPassword }).expect(400);
      expect(res.body.error).toBe('INVALID_RESET_TOKEN');
    });

    it('resets the password once, revokes existing sessions, and refuses the token a second time', async () => {
      const { refreshToken } = await login();
      const token = await requestLink();

      await post('/auth/reset-password', { token, newPassword }).expect(204);

      await post('/auth/refresh', { refreshToken }).expect(401);
      await post('/auth/login', { email: traderEmail, password }).expect(401);
      await post('/auth/login', { email: traderEmail, password: newPassword }).expect(200);
      expect(sentEmails.at(-1)).toMatchObject({ to: traderEmail, subject: 'Your NextTrade password was changed' });
      const reused = await post('/auth/reset-password', { token, newPassword: 'third-correct-horse' }).expect(400);
      expect(reused.body.error).toBe('INVALID_RESET_TOKEN');
    });
  });
});
