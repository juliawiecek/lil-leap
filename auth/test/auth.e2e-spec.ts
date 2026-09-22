import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { tlsKeystorePath } from '../src/security/tls';

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

  const post = (path: string, body?: object) =>
    request(app.getHttpServer()).post(path).disableTLSCerts().send(body);

  const login = async () => {
    const res = await post('/auth/login', { email: traderEmail, password }).expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  };

  beforeAll(async () => {
    const keystore = tlsKeystorePath();
    if (!keystore) {
      throw new Error('TLS_KEYSTORE must point to a PKCS12 keystore for the e2e run.');
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
      for (const table of ['sessions', 'accounts', 'financial_profiles', 'customer_profiles', 'analyst_profiles']) {
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
    it('creates a TRADER with profile, financial profile, and account -- no tokens', async () => {
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
        trader_level: 'NOVICE',
      }).expect(201);

      expect(res.body).toMatchObject({ email: traderEmail, userRole: 'TRADER' });
      expect(res.body.accessToken).toBeUndefined();

      const [row] = await dataSource.query(
        `SELECT cp.address, jsonb_typeof(fp.regulatory_disclosures) AS disclosures_type, fp.regulatory_disclosures, fp.annual_income, a.min_balance_requirement
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
      expect(Number(row.min_balance_requirement)).toBe(5000);
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
      expect(refreshToken).toEqual(expect.any(String));
    });

    it('fails identically for a wrong password and an unknown email', async () => {
      const wrongPassword = await post('/auth/login', { email: traderEmail, password: 'nope-nope-nope' }).expect(401);
      const unknownEmail = await post('/auth/login', { email: 'nobody@example.com', password }).expect(401);

      expect(wrongPassword.body).toEqual({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
      expect(unknownEmail.body).toEqual(wrongPassword.body);
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
});
