import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { INVALID_SIGN_IN_MESSAGE } from '../src/security/login-policy';

/**
 * Without TLS_KEYSTORE the service sits behind nginx (TLS terminates there) and
 * must serve plaintext -- this is how docker-compose runs it.
 */
describe('auth behind nginx (e2e)', () => {
  let app: INestApplication;
  const keystore = process.env.TLS_KEYSTORE;

  beforeAll(async () => {
    delete process.env.TLS_KEYSTORE;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (keystore !== undefined) process.env.TLS_KEYSTORE = keystore;
  });

  it('serves health over plaintext', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('reaches the auth endpoints over plaintext instead of rejecting with HTTPS_REQUIRED', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever-password' })
      .expect(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');

    await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken: 'never-issued' }).expect(204);
  });

  describe('NEXT-253 persisted account lockout', () => {
    let db: DataSource;
    let email: string;
    let userId: string;
    const password = 'next253-correct-password';
    const denied = { error: 'INVALID_CREDENTIALS', message: INVALID_SIGN_IN_MESSAGE };
    const login = (secret = password, address = email) => request(app.getHttpServer())
      .post('/auth/login').send({ email: address, password: secret });
    const state = async () => (await db.query(
      'SELECT failed_login_attempts, locked_until FROM users WHERE user_id = $1', [userId],
    ))[0];

    beforeEach(async () => {
      db = app.get(DataSource);
      const run = randomUUID();
      email = `next253-${run}@example.test`;
      const response = await request(app.getHttpServer()).post('/auth/register').send({
        user_role: 'ANALYST', email, password, employee_id: run.slice(0, 20),
      }).expect(201);
      userId = response.body.id;
    });

    afterEach(async () => {
      if (userId) {
        await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM analyst_profiles WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM users WHERE user_id = $1', [userId]);
      }
    });

    it('commits the third failure, conceals lock/account state, then permits login after expiry', async () => {
      for (let count = 1; count <= 3; count++) {
        expect((await login('wrong').expect(401)).body).toEqual(denied);
        const row = await state();
        expect(row.failed_login_attempts).toBe(count);
        if (count < 3) expect(row.locked_until).toBeNull();
      }
      const locked = await state();
      const remaining = locked.locked_until.getTime() - Date.now();
      expect(remaining).toBeGreaterThan(14 * 60_000);
      expect(remaining).toBeLessThanOrEqual(15 * 60_000);
      expect((await login().expect(401)).body).toEqual(denied);
      expect((await login('wrong', `unknown-${randomUUID()}@example.test`).expect(401)).body).toEqual(denied);
      expect(await state()).toEqual(locked);
      expect((await db.query('SELECT COUNT(*)::int AS count FROM sessions WHERE user_id = $1', [userId]))[0].count).toBe(0);
      // Advance the persisted deadline rather than waiting 15 minutes; unit tests cover the exact boundary.
      await db.query("UPDATE users SET locked_until = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE user_id = $1", [userId]);
      const success = await login().expect(200);
      expect(success.body.accessToken).toEqual(expect.any(String));
      expect(success.body.user).not.toHaveProperty('failedLoginAttempts');
      expect(success.body.user).not.toHaveProperty('lockedUntil');
      expect(await state()).toEqual({ failed_login_attempts: 0, locked_until: null });
    });

    it('resets a two-failure streak on successful sign-in', async () => {
      await login('wrong').expect(401);
      await login('wrong').expect(401);
      await login().expect(200);
      expect(await state()).toEqual({ failed_login_attempts: 0, locked_until: null });
      await login('wrong').expect(401);
      expect(await state()).toEqual({ failed_login_attempts: 1, locked_until: null });
    });

    it('serializes concurrent failures and locks the same normalized account exactly at three', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        login('wrong', i % 2 ? ` ${email.toUpperCase()} ` : email)));
      for (const response of results) {
        expect(response.status).toBe(401);
        expect(response.body).toEqual(denied);
      }
      expect((await state()).failed_login_attempts).toBe(3);
      expect((await state()).locked_until).toBeInstanceOf(Date);
      await login().expect(401);
    });
  });
});
