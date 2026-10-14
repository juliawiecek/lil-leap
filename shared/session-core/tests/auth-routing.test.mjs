import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { HttpRequest, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { of, throwError, firstValueFrom, Subject } from 'rxjs';
const { authInterceptor, SESSION_AUTH } = await import('../src/auth-routing.ts');
const { safeReturnUrl } = await import('../src/page-state.ts');
globalThis.window = { location: { origin: 'http://localhost' } };
function intercept(t, auth, url, next) {
  const injector = createEnvironmentInjector(
    [{ provide: SESSION_AUTH, useValue: auth }],
    Injector.NULL,
  );
  t.after(() => injector.destroy());
  return runInInjectionContext(injector, () => authInterceptor(new HttpRequest('GET', url), next));
}

test('HTTP requests to owned API routes carry the memory-only access token', async (t) => {
  let sent;
  await firstValueFrom(
    intercept(t, { accessToken: 'test-token' }, '/api/v1/quotes', (request) => {
      sent = request;
      return of(new HttpResponse({ status: 200 }));
    }),
  );
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token');
});

for (const url of ['/auth/login', 'https://other.example/api/v1/quotes']) {
  test('the interceptor does not disclose access tokens to ' + url, async (t) => {
    let sent;
    await firstValueFrom(
      intercept(t, { accessToken: 'test-token' }, url, (request) => {
        sent = request;
        return of(new HttpResponse({ status: 200 }));
      }),
    );
    assert.equal(sent.headers.has('Authorization'), false);
  });
}

test('401 invalidation uses the token actually sent and does not retry requests', async (t) => {
  const invalidated = [];
  let requests = 0;
  await assert.rejects(
    firstValueFrom(
      intercept(
        t,
        { accessToken: 'test-token', unauthorized: (token) => invalidated.push(token) },
        '/api/v1/orders',
        () => {
          ++requests;
          return throwError(() => new HttpErrorResponse({ status: 401 }));
        },
      ),
    ),
    (error) => error.status === 401,
  );
  assert.deepEqual(invalidated, ['test-token']);
  assert.equal(requests, 1);
});

test('an old failed request retains its token snapshot after a rotation', async (t) => {
  const invalidated = [];
  const auth = { accessToken: 'old-token', unauthorized: (token) => invalidated.push(token) };
  const response = new Subject();
  const pending = firstValueFrom(intercept(t, auth, '/api/v1/orders', () => response));
  auth.accessToken = 'new-token';
  response.error(new HttpErrorResponse({ status: 401 }));
  await assert.rejects(pending, (error) => error.status === 401);
  assert.deepEqual(invalidated, ['old-token']);
});

test('post-login destinations are restricted to local app routes', () => {
  assert.equal(safeReturnUrl('/orders?q=AAPL', { Orders: '/orders' }), '/orders?q=AAPL');
  for (const url of [
    'https://evil.example',
    '//evil.example',
    '/login',
    '/missing',
    '/orders/../../login',
    '/\\evil.example',
  ]) {
    assert.equal(safeReturnUrl(url, { Orders: '/orders' }), null);
  }
});
