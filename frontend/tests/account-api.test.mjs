import assert from 'node:assert/strict';
import { test } from 'node:test';

for (const app of ['frontend', 'insights-frontend']) {
  const { AccountApi, registrationPayload } = await import(`../../${app}/src/app/account-api.ts`);

  test(`${app}: maps the form to the backend contract without privileged fields`, () => {
    const payload = registrationPayload({
      date_of_birth: '2000-01-01', citizenship_status: 'CITIZEN', accredited_investor: 'false',
      broker_affiliation: 'true', risk_profile: '', user_role: 'ANALYST', kyc_status: 'VERIFIED',
      funds_source_verified: 'true', address: 'derived value',
    }, ' client@example.test ', ' Password123! ');
    assert.deepEqual(payload, {
      email: 'client@example.test', password: ' Password123! ', date_of_birth: '2000-01-01',
      citizenship_status: 'CITIZEN', accredited_investor: false, broker_affiliation: true,
    });
  });

  test(`${app}: registers only on HTTP 201 and handles duplicate/server/network errors safely`, async (t) => {
    const api = new AccountApi();
    let request;
    const stub = t.mock.method(globalThis, 'fetch', async (path, options) => {
      request = { path, options };
      return new Response('{"id":"test-user-id"}', { status: 201 });
    });
    await api.register({ date_of_birth: '2000-01-01', citizenship_status: 'CITIZEN' }, 'client@example.test', 'Password123!');
    assert.equal(request.path, '/api/v1/users');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.redirect, 'error');
    for (const status of [200, 400, 409, 500]) {
      stub.mock.mockImplementation(async () => new Response('password=secret-canary', { status }));
      await assert.rejects(api.register({}, 'client@example.test', 'Password123!'), error => !error.message.includes('canary'));
    }
    stub.mock.mockImplementation(async () => { throw new Error('password=secret-canary'); });
    await assert.rejects(api.register({}, 'client@example.test', 'Password123!'), /Unable to connect/);
  });

  test(`${app}: login requires a real token and sign-out clears the in-memory session`, async (t) => {
    const api = new AccountApi();
    const stub = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ token: 'test-token', user: { email: 'client@example.test' } })));
    assert.equal((await api.login('client@example.test', 'Password123!')).email, 'client@example.test');
    assert.deepEqual(api.authorizationHeaders(), { Authorization: 'Bearer test-token' });
    api.signOut();
    assert.deepEqual(api.authorizationHeaders(), {});
    for (const response of [new Response('{}'), new Response('invalid JSON'), new Response('{}', { status: 401 })]) {
      stub.mock.mockImplementation(async () => response);
      await assert.rejects(api.login('client@example.test', 'incorrect-password'));
      assert.deepEqual(api.authorizationHeaders(), {});
    }
  });
}
