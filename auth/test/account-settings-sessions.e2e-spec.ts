import * as fs from 'fs';
import * as path from 'path';
import * as request from 'supertest';
import { spawn, execFileSync } from 'child_process';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { configureApp } from '../src/app.setup';
import { MAIL_DELIVERY, MailMessage } from '../src/mail/mail-message';

/** Real HTTP controllers, password hashing and PostgreSQL; only outbound mail is captured.
 * Creates and drops its own database; never resets a user's real account or sessions.
 * Run with TEST_POSTGRES_PASSWORD and optional TEST_POSTGRES_HOST/PORT/USER.
 */
const databaseTest = process.env.TEST_POSTGRES_PASSWORD ? describe : describe.skip;
databaseTest('PS-07 password change across real sessions', () => {
  let app: INestApplication;
  let admin: DataSource;
  let data: DataSource;
  let created = false;
  const javaModules = ['nextTrade-orders', 'nextTrade-holdings', 'insights'];
  let javaBuild: string;
  const javaBin = (name: string) => process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
  const probe = (module: string, token: string): Promise<boolean> => new Promise((resolve, reject) => {
    const child = spawn(javaBin('java'), ['-cp', path.join(javaBuild, module), path.join(__dirname, 'SessionProbe.java'),
      `http://127.0.0.1:${app.getHttpServer().address().port}/auth/me/session`], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => output += chunk);
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output === 'true') : reject(new Error('Java session probe failed')));
    child.stdin.end(token + '\n');
  });
  const database = `ps07_${randomUUID().replace(/-/g, '')}`;
  const email = 'ps07-session-check@example.com';
  const originalPassword = 'original-test-password-123';
  const newPassword = 'replacement-test-password-456';
  const notices: MailMessage[] = [];
  let first: { accessToken: string; refreshToken: string };
  let second: { accessToken: string; refreshToken: string };
  let replacement: { accessToken: string; refreshToken: string };
  let userId: string;
  const post = (url: string, body: object) => request(app.getHttpServer()).post(url).send(body);
  const profile = (token: string) => request(app.getHttpServer()).get(`/auth/users/${userId}`).auth(token, { type: 'bearer' });

  beforeAll(async () => {
    javaBuild = fs.mkdtempSync(path.join(os.tmpdir(), 'ps07-java-'));
    const connection = {
      type: 'postgres' as const,
      host: process.env.TEST_POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.TEST_POSTGRES_PORT ?? 5432),
      username: process.env.TEST_POSTGRES_USER ?? 'postgres',
      password: process.env.TEST_POSTGRES_PASSWORD,
    };
    admin = await new DataSource({ ...connection, database: 'postgres' }).initialize();
    if (!/^ps07_[a-f0-9]{32}$/.test(database)) throw new Error('Invalid isolated test database');
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const setup = await new DataSource({ ...connection, database }).initialize();
    try { await setup.query(fs.readFileSync(path.resolve(__dirname, '../../db/finalized-schema.sql'), 'utf8')); }
    finally { await setup.destroy(); }
    Object.assign(process.env, {
      DB_HOST: connection.host, DB_PORT: String(connection.port), DB_NAME: database,
      DB_APP_USERNAME: connection.username, DB_APP_PASSWORD: connection.password,
      APP_JWT_SECRET: 'ps07-isolated-test-secret-at-least-32-characters',
      NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY: 'ps07-isolated-encryption-key',
      SESSION_INACTIVITY_MINUTES: '10', APP_JWT_EXPIRATION_MINUTES: '10', TLS_KEYSTORE: '',
    });
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_DELIVERY).useValue({ send: async (notice: MailMessage) => { notices.push(notice); } }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    for (const module of javaModules) {
      fs.mkdirSync(path.join(javaBuild, module), { recursive: true });
      execFileSync(javaBin('javac'), ['-d', path.join(javaBuild, module),
        path.resolve(__dirname, '../../', module, 'src/main/java/com/neueda/leap/security/AuthSessionClient.java')]);
    }
    data = app.get(DataSource);
      await post('/auth/register', {
        user_role: 'TRADER',
        email: email,
        password: originalPassword,
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
        initial_deposit: '10,000',
        accredited_investor: false,
        is_politically_exposed_person: false,
        broker_affiliation: true,
        broker_firm_name: 'Quote "Firm"',
        broker_affiliation_details: 'line one\nline two',
        account_name: 'Main',
        account_type: 'INDIVIDUAL_CASH',
        trader_level: 'ADVANCED', // ignored: $25k-100k + 10% of 50,000 = 30,000 capacity -> NOVICE
      }).expect(201);
    userId = (await data.query('SELECT user_id FROM users WHERE email=$1', [email]))[0].user_id;
    first = (await post('/auth/login', { email, password: originalPassword }).expect(200)).body;
    second = (await post('/auth/login', { email, password: originalPassword }).expect(200)).body;
    await profile(first.accessToken).expect(200);
    await profile(second.accessToken).expect(200);
    for (const module of javaModules) expect(await probe(module, second.accessToken)).toBe(true);
  }, 60000);

  afterAll(async () => {
    await app?.close();
    if (created && /^ps07_[a-f0-9]{32}$/.test(database)) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (admin?.isInitialized) await admin.destroy();
    if (javaBuild) fs.rmSync(javaBuild, { recursive: true, force: true });
  });

  it('revokes both old refresh sessions, preserves the caller through a new pair, and writes a safe audit event', async () => {
    replacement = (await post('/auth/me/password', { currentPassword: originalPassword, newPassword })
      .auth(first.accessToken, { type: 'bearer' }).expect(200)).body;
    expect(replacement.refreshToken).not.toBe(first.refreshToken);
    const rows = await data.query('SELECT revoked_at FROM sessions WHERE user_id=$1', [userId]);
    expect(rows.filter((row: { revoked_at: Date | null }) => row.revoked_at !== null)).toHaveLength(2);
    expect(rows.filter((row: { revoked_at: Date | null }) => row.revoked_at === null)).toHaveLength(1);
    await post('/auth/refresh', { refreshToken: second.refreshToken }).expect(401);
    await post('/auth/refresh', { refreshToken: first.refreshToken }).expect(401);
    await profile(replacement.accessToken).expect(200);
    await post('/auth/refresh', { refreshToken: replacement.refreshToken }).expect(200);
    await post('/auth/login', { email, password: originalPassword }).expect(401);
    await post('/auth/login', { email, password: newPassword }).expect(200);
    const events = await data.query("SELECT payload FROM audit_log WHERE user_id=$1 AND event_type='PASSWORD_CHANGED'", [userId]);
    expect(events).toEqual([{ payload: { otherSessionsSignedOut: true } }]);
    expect(notices).toHaveLength(1);
    expect(notices[0].subject).toBe('Your NextTrade password was changed');
  });

  it('immediately rejects the other device access token without reducing its ten-minute lifetime', async () => {
    await profile(second.accessToken).expect(401);
    await request(app.getHttpServer()).get('/auth/me/session').auth(second.accessToken, { type: 'bearer' }).expect(401);
    const claims = JSON.parse(Buffer.from(second.accessToken.split('.')[1], 'base64url').toString());
    expect(claims.exp - claims.iat).toBe(600);
    for (const module of javaModules) expect(await probe(module, second.accessToken)).toBe(false);
  });
  it('a concurrent refresh cannot escape password-change revocation', async () => {
    const login = async () => (await post('/auth/login', { email, password: newPassword }).expect(200)).body;
    const changer = await login();
    const other = await login();
    const [refresh, changed] = await Promise.all([
      post('/auth/refresh', { refreshToken: other.refreshToken }),
      post('/auth/me/password', { currentPassword: newPassword, newPassword: 'third-test-password-789' })
        .auth(changer.accessToken, { type: 'bearer' }),
    ]);
    expect(changed.status).toBe(200);
    expect([200, 401]).toContain(refresh.status);
    await profile(other.accessToken).expect(401);
    if (refresh.status === 200) {
      await profile(refresh.body.accessToken).expect(401);
      await post('/auth/refresh', { refreshToken: refresh.body.refreshToken }).expect(401);
    }
    await profile(changed.body.accessToken).expect(200);
    for (const module of javaModules) expect(await probe(module, changed.body.accessToken)).toBe(true);
    await request(app.getHttpServer()).get('/auth/me/session').auth(changed.body.accessToken, { type: 'bearer' }).expect(204);
  });

});
