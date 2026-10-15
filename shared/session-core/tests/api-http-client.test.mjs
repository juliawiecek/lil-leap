import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { Window } from 'happy-dom';
const { ApiHttpClient } = await import('../src/api-http-client.ts');
const { authInterceptor, SESSION_AUTH } = await import('../src/auth-routing.ts');

const browser = new Window({ url: 'http://localhost/' });
globalThis.window = browser;
globalThis.document = browser.document;
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

function fixture(t, token = 'current-token') {
  const invalidated = [];
  const auth = { accessToken: token, unauthorized: sent => invalidated.push(sent) };
  TestBed.configureTestingModule({ providers: [
    provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
    { provide: SESSION_AUTH, useValue: auth },
  ] });
  const http = TestBed.inject(ApiHttpClient);
  const backend = TestBed.inject(HttpTestingController);
  t.after(() => { backend.verify(); TestBed.resetTestingModule(); });
  return { auth, http, backend, invalidated };
}

test('shared GET/POST pipeline preserves options and bodies and reads the current token', async t => {
  const f = fixture(t);
  const get = firstValueFrom(f.http.get('/api/v1/orders', {
    params: { status: 'FILLED', limit: 5 }, headers: { 'X-Correlation-ID': 'request-1' },
  }));
  const request = f.backend.expectOne('/api/v1/orders?status=FILLED&limit=5');
  assert.equal(request.request.headers.get('Authorization'), 'Bearer current-token');
  assert.equal(request.request.headers.get('X-Correlation-ID'), 'request-1');
  request.flush([{ orderId: 'o1' }]);
  assert.deepEqual(await get, [{ orderId: 'o1' }]);
  f.auth.accessToken = 'rotated-token';
  const body = { quantity: 2, clientReference: 'unique-reference' };
  const post = firstValueFrom(f.http.post('/api/v1/orders', body));
  const submitted = f.backend.expectOne('/api/v1/orders');
  assert.equal(submitted.request.method, 'POST');
  assert.deepEqual(submitted.request.body, body);
  assert.equal(submitted.request.headers.get('Authorization'), 'Bearer rotated-token');
  submitted.flush({ orderId: 'o2' });
  assert.deepEqual(await post, { orderId: 'o2' });
  const plain = firstValueFrom(f.http.get('/api/v1/accounts'));
  f.backend.expectOne('/api/v1/accounts').flush([]);
  assert.deepEqual(await plain, []);
  const withOptions = firstValueFrom(f.http.post('/api/v1/orders', body, { headers: { 'X-Request-ID': 'r2' } }));
  const optionsRequest = f.backend.expectOne('/api/v1/orders');
  assert.equal(optionsRequest.request.headers.get('X-Request-ID'), 'r2');
  optionsRequest.flush({});
  await withOptions;
});

for (const url of ['/auth/login', '/auth/reset-password', '/assets/logo.svg', 'https://external.example/api/v1/orders', '/api-other']) {
  test(`excluded request ${url} carries no JWT and its 401 cannot invalidate the session`, async t => {
    const f = fixture(t);
    const pending = firstValueFrom(f.http.get(url));
    const rejected = assert.rejects(pending, error => error.status === 401);
    const request = f.backend.expectOne(url);
    assert.equal(request.request.headers.has('Authorization'), false);
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    assert.deepEqual(f.invalidated, []);
  });
}

for (const body of [null, 'malformed json', { error: 'UNAUTHORIZED' }]) {
  test(`401 invalidates before domain parsing, body=${JSON.stringify(body)}`, async t => {
    const f = fixture(t);
    const pending = firstValueFrom(f.http.post('/api/v1/orders', { quantity: 1 }));
    const rejected = assert.rejects(pending, error => error.status === 401);
    const request = f.backend.expectOne('/api/v1/orders');
    f.auth.accessToken = 'newer-token';
    request.flush(body, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    assert.deepEqual(f.invalidated, ['current-token']);
    f.backend.expectNone('/api/v1/orders');
  });
}

for (const status of [403, 500]) {
  test(`HTTP ${status} propagates without invalidating the session`, async t => {
    const f = fixture(t);
    const pending = firstValueFrom(f.http.get('/api/v1/accounts'));
    const rejected = assert.rejects(pending, error => error.status === status);
    f.backend.expectOne('/api/v1/accounts').flush({}, { status, statusText: 'Rejected' });
    await rejected;
    assert.deepEqual(f.invalidated, []);
  });
}

test('a signed-out API call sends no Authorization header', async t => {
  const f = fixture(t, null);
  const pending = firstValueFrom(f.http.get('http://localhost/api/v1/accounts'));
  const request = f.backend.expectOne('http://localhost/api/v1/accounts');
  assert.equal(request.request.headers.has('Authorization'), false);
  request.flush([]);
  assert.deepEqual(await pending, []);
});
