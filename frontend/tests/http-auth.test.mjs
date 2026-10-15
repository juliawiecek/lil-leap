import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ApiHttpClient, SESSION_AUTH } from '@lilleap/session-core/angular';
import { AuthClient } from '@lilleap/session-core/core';
const { AuthService } = await import('../src/app/auth.service.ts');
const { AppSessionService } = await import('../src/app/app-session.service.ts');
const { appConfig } = await import('../src/app/app.config.ts');
const { routes } = await import('../src/app/app.routes.ts');
const { OrderSubmissionClient } = await import('../src/app/order-submission-api.ts');
const browser = new Window({ url: 'http://localhost/' });
globalThis.window = browser;
globalThis.document = browser.document;
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

async function fixture(t, role = 'TRADER', lifetime = 600, malformed = false) {
  const values = new Map();
  const navigations = [];
  let issued = 0;
  const auth = new AuthClient(async url => {
    if (url.endsWith('/logout')) return new Response(null, { status: 204 });
    const iat = Math.floor(Date.now() / 1000);
    const accessToken = 'test.' + Buffer.from(JSON.stringify({
      sub: 'user-1', user_role: role, iat, exp: iat + lifetime, jti: ++issued,
    })).toString('base64url') + '.test';
    return Response.json({ accessToken: malformed ? 'invalid-token' : accessToken, refreshToken: 'refresh-' + issued, user: { userRole: role } });
  }, '/auth', { storage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  } });
  const router = {
    url: '/orders',
    navigate: async (parts, options) => { navigations.push({ parts, options }); router.url = '/login'; },
    createUrlTree: (parts, options) => ({ parts, options }), parseUrl: value => value,
  };
  TestBed.configureTestingModule({ providers: [
    ...appConfig.providers, provideHttpClientTesting(),
    { provide: AuthService, useValue: auth }, { provide: Router, useValue: router },
  ] });
  const session = TestBed.inject(AppSessionService);
  const backend = TestBed.inject(HttpTestingController);
  t.after(() => { session.ngOnDestroy(); backend.verify(); TestBed.resetTestingModule(); });
  await auth.login('synthetic@example.test', 'synthetic-password');
  await session.initialize();
  return { auth, values, navigations, router, backend, session, http: TestBed.inject(ApiHttpClient) };
}

test('app configuration connects shared GET/POST auth and concurrent 401s to one login redirect', async t => {
  const f = await fixture(t);
  assert.equal(TestBed.inject(SESSION_AUTH), f.auth);
  const token = f.auth.accessToken;
  const get = firstValueFrom(f.http.get('/api/v1/accounts', { params: { active: true } }));
  const request = f.backend.expectOne('/api/v1/accounts?active=true');
  assert.equal(request.request.headers.get('Authorization'), 'Bearer ' + token);
  request.flush([]);
  assert.deepEqual(await get, []);
  const body = { accountId: 'a1', instrumentId: 'i1', side: 'BUY', quantity: 2, clientReference: 'r1' };
  const post = new OrderSubmissionClient(f.auth, f.http).submit(body);
  const second = firstValueFrom(f.http.get('/api/v1/holdings'));
  const rejectedPost = assert.rejects(post, error => error.httpStatus === 401);
  const rejectedGet = assert.rejects(second, error => error.status === 401);
  const submitted = f.backend.expectOne('/api/v1/orders');
  assert.equal(submitted.request.headers.get('Authorization'), 'Bearer ' + token);
  assert.deepEqual(submitted.request.body, { ...body, orderType: 'MARKET' });
  submitted.flush('invalid JSON', { status: 401, statusText: 'Unauthorized' });
  f.backend.expectOne('/api/v1/holdings').flush(null, { status: 401, statusText: 'Unauthorized' });
  await Promise.all([rejectedPost, rejectedGet]);
  assert.equal(f.auth.accessToken, null);
  assert.equal(f.values.size, 0);
  assert.equal(f.session.running, false);
  assert.equal(f.navigations.length, 1);
  assert.deepEqual(f.navigations[0].parts, ['/login']);
  assert.equal(f.navigations[0].options.queryParams.returnUrl, '/orders');
  f.backend.expectNone('/api/v1/orders');
});

test('an older request cannot clear a newer app login', async t => {
  const f = await fixture(t);
  const pending = firstValueFrom(f.http.get('/api/v1/accounts'));
  const rejected = assert.rejects(pending, error => error.status === 401);
  const old = f.backend.expectOne('/api/v1/accounts');
  await f.auth.login('synthetic@example.test', 'synthetic-password');
  const current = f.auth.accessToken;
  assert.notEqual(old.request.headers.get('Authorization'), 'Bearer ' + current);
  old.flush({}, { status: 401, statusText: 'Unauthorized' });
  await rejected;
  assert.equal(f.auth.accessToken, current);
  assert.equal(f.navigations.length, 0);
});

for (const scenario of ['signed out', 'expired', 'malformed', 'wrong role']) {
  test('all protected routes reject a ' + scenario + ' session', async t => {
    const role = scenario === 'wrong role' ? 'ANALYST' : 'TRADER';
    const f = await fixture(t, role, scenario === 'expired' ? -10 : 600, scenario === 'malformed');
    if (scenario === 'signed out') await f.auth.logout();
    for (const route of routes.filter(route => route.canActivate && !['login', 'reset-password'].includes(route.path))) {
      const result = await runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
        route.canActivate[0](null, { url: '/' + route.path.replace(':id', '123') }));
      assert.deepEqual(result.parts, ['/login']);
    }
    assert.equal(f.session.authenticated, false);
  });
}


test('a valid app session can activate every protected route', async t => {
  const f = await fixture(t);
  for (const route of routes.filter(route => route.canActivate && !['login', 'reset-password'].includes(route.path))) {
    const result = await runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      route.canActivate[0](null, { url: '/' + route.path.replace(':id', '123') }));
    assert.equal(result, true);
  }
  assert.equal(f.session.authenticated, true);
  assert.equal(f.navigations.length, 0);
});
