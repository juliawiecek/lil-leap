import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

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
});
