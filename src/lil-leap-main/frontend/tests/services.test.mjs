import assert from 'node:assert/strict';
import { test } from 'node:test';
import './component-helper.mjs';
import { createEnvironmentInjector, Injector, ErrorHandler } from '@angular/core';
const { AuthService } = await import('../src/app/auth.service.ts');
const { SafeErrorHandler } = await import('../src/app/safe-error-handler.ts');
const { appConfig } = await import('../src/app/app.config.ts');

test('injected auth service shares one session and revokes it on logout', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return url.endsWith('/logout') ? new Response(null, { status: 204 }) : Response.json({ accessToken: 'access', refreshToken: 'refresh', user: { email: 'ada@example.com' } });
  });
  const injector = createEnvironmentInjector([AuthService], Injector.NULL); t.after(() => injector.destroy());
  const service = injector.get(AuthService);
  assert.equal(injector.get(AuthService), service);
  await service.login('ada@example.com', 'password'); assert.equal(service.accessToken, 'access');
  await service.logout(); assert.equal(service.accessToken, null);
  assert.deepEqual(requests[1], { url: '/auth/logout', body: { refreshToken: 'refresh' } });
});

test('configured Angular error handler never exposes exception details', t => {
  const provider = appConfig.providers.find(p => p.provide === ErrorHandler);
  assert.equal(provider.useClass, SafeErrorHandler);
  const injector = createEnvironmentInjector([provider], Injector.NULL); t.after(() => injector.destroy());
  const log = t.mock.method(console, 'error', () => {});
  injector.get(ErrorHandler).handleError(new Error('password=secret'));
  assert.deepEqual(log.mock.calls[0].arguments, ['An application error occurred.']);
});
