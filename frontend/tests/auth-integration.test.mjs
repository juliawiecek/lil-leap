import assert from 'node:assert/strict';
import { test } from 'node:test';
import './dom-helper.mjs';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors, HttpResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthClient } from '../../frontend-shared/auth-api.ts';
const { AuthService } = await import('../src/app/auth.service.ts');
const { jwtInterceptor } = await import('../src/app/jwt-interceptor.ts');
const { angularTransport } = await import('../src/app/http-transport.ts');
const { sessionGuard } = await import('../src/app/routes.ts');

let initialized = false;
function setup(t) {
  if (!initialized) {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    initialized = true;
  }
  let ended = 0;
  const auth = { accessToken: 'first', endSession() { ended++; this.accessToken = null; } };
  TestBed.configureTestingModule({ providers: [
    provideHttpClient(withInterceptors([jwtInterceptor])), provideHttpClientTesting(),
    { provide: AuthService, useValue: auth },
  ] });
  const controller = TestBed.inject(HttpTestingController);
  t.after(() => { controller.verify(); TestBed.resetTestingModule(); });
  return { auth, transport: angularTransport(TestBed.inject(HttpClient)), controller, ended: () => ended };
}

test('shared transport attaches the current JWT to protected same-origin APIs and rules', async t => {
  const { auth, transport, controller } = setup(t);
  for (const url of ['/api/v1/holdings', '/rules/tier-eligibility', 'http://localhost/api/v1/orders']) {
    auth.accessToken = `token-for-${url}`;
    const response = transport(url);
    const outgoing = controller.expectOne(url);
    assert.equal(outgoing.request.headers.get('Authorization'), `Bearer ${auth.accessToken}`);
    outgoing.flush('{"ok":true}');
    assert.deepEqual(await (await response).json(), { ok: true });
  }
});

test('public authentication and external requests never receive the application token', async t => {
  const { transport, controller } = setup(t);
  for (const url of ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', 'https://external.example/api/v1/data']) {
    const response = transport(url);
    const outgoing = controller.expectOne(url);
    assert.equal(outgoing.request.headers.has('Authorization'), false);
    outgoing.flush('{}'); await response;
  }
});

test('concurrent protected 401s end the session once and preserve the original HTTP failure', async t => {
  const { transport, controller, ended } = setup(t);
  const first = transport('/api/v1/cash');
  const second = transport('/api/v1/holdings');
  controller.expectOne('/api/v1/cash').flush('{}', { status: 401, statusText: 'Unauthorized' });
  controller.expectOne('/api/v1/holdings').flush('{}', { status: 401, statusText: 'Unauthorized' });
  assert.equal((await first).status, 401); assert.equal((await second).status, 401);
  assert.equal(ended(), 1);
});

test('403, invalid login, and an old token failure do not end a newer session', async t => {
  const { auth, transport, controller, ended } = setup(t);
  for (const [url, status] of [['/api/v1/reports/summary', 403], ['/auth/login', 401]]) {
    const response = transport(url);
    controller.expectOne(url).flush('{}', { status, statusText: 'Rejected' });
    assert.equal((await response).status, status);
  }
  const old = transport('/api/v1/cash');
  auth.accessToken = 'new-login-token';
  controller.expectOne('/api/v1/cash').flush('{}', { status: 401, statusText: 'Unauthorized' });
  await old; assert.equal(ended(), 0);
});

test('HTTP adapter preserves JSON writes and empty successful logout responses without retries', async t => {
  const { transport, controller } = setup(t);
  const response = transport('/api/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"quantity":1}' });
  const outgoing = controller.expectOne('/api/v1/orders');
  assert.equal(outgoing.request.method, 'POST');
  assert.equal(outgoing.request.body, '{"quantity":1}');
  outgoing.flush('{}', { status: 401, statusText: 'Unauthorized' });
  assert.equal((await response).status, 401);
  const logout = transport('/auth/logout', { method: 'POST', body: '{}' });
  controller.expectOne('/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
  assert.equal((await logout).status, 204);
});

test('route guard admits only a valid token with the application role', t => {
  const expectedRole = 'TRADER';
  let stopped = 0;
  let cleared = 0;
  const auth = { sessionValid: true, userRole: expectedRole, accessToken: 'token',
    clearSession() { cleared++; }, session: { stop() { stopped++; } } };
  const router = { createUrlTree: parts => parts.join('/') };
  const injector = createEnvironmentInjector([{ provide: AuthService, useValue: auth }, { provide: Router, useValue: router }], Injector.NULL);
  t.after(() => injector.destroy());
  const guard = () => runInInjectionContext(injector, () => sessionGuard({}, {}));
  assert.equal(guard(), true);
  auth.sessionValid = false;
  assert.equal(guard(), '/login'); assert.equal(cleared, 1); assert.equal(stopped, 1);
  auth.sessionValid = true; auth.userRole = expectedRole === 'TRADER' ? 'ANALYST' : 'TRADER';
  assert.equal(guard(), '/login');
  auth.accessToken = null; auth.sessionValid = false;
  assert.equal(guard(), '/login');
});

test('auth validity rejects expired and malformed claims and keeps credentials in memory', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const claims = { sub: 'user-id', user_role: 'TRADER', iat: 100, exp: 700 };
  const token = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  const auth = new AuthClient(async () => Response.json({ accessToken: token, refreshToken: 'refresh', user: {} }));
  await auth.login('test@example.com', 'test'); assert.equal(auth.sessionValid, true);
  t.mock.timers.tick(600_001); assert.equal(auth.sessionValid, false);
  auth.clearSession(); assert.equal(auth.sessionValid, false); assert.equal(auth.accessToken, null);
  const malformed = new AuthClient(async () => Response.json({ accessToken: 'malformed', refreshToken: 'refresh', user: {} }));
  await malformed.login('test@example.com', 'test'); assert.equal(malformed.sessionValid, false);
});

test('ending the session cancels timers and redirects only once across concurrent failures', async t => {
  const navigations = [];
  const calls = [];
  const claims = { sub: 'user-id', user_role: 'TRADER', iat: 100, exp: 700 };
  const token = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  const http = { request(method, url) {
    calls.push(url);
    return of(new HttpResponse({ status: url.endsWith('/logout') ? 204 : 200,
      body: url.endsWith('/logout') ? null : JSON.stringify({ accessToken: token, refreshToken: 'refresh', user: {} }) }));
  } };
  const injector = createEnvironmentInjector([AuthService, { provide: HttpClient, useValue: http },
    { provide: Router, useValue: { navigate(...args) { navigations.push(args); return Promise.resolve(true); } } }], Injector.NULL);
  t.after(() => injector.destroy());
  const auth = injector.get(AuthService);
  await auth.login('test@example.com', 'test'); assert.equal(auth.session.running, true);
  auth.endSession(); auth.endSession();
  assert.equal(auth.session.running, false); assert.equal(auth.accessToken, null);
  assert.equal(navigations.length, 1); assert.equal(calls.filter(url => url.endsWith('/logout')).length, 1);
  await auth.login('test@example.com', 'test'); auth.endSession(); assert.equal(navigations.length, 2);
});
