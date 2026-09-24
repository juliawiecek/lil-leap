import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthApiError, AuthClient } from '../src/app/auth-api.ts';
import { toTraderRegistration } from '../src/app/registration-payload.ts';

/** Records requests and answers each with the next queued response. */
function fakeFetch(...responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
  };
  return { calls, fetchImpl };
}

const loginResponse = {
  status: 200,
  body: { accessToken: 'access', refreshToken: 'refresh', user: { id: 'u1', email: 'a@example.com', userRole: 'TRADER' } },
};

test('calls same-origin /auth paths so nginx can proxy them without CORS', async () => {
  const { calls, fetchImpl } = fakeFetch(loginResponse);
  await new AuthClient(fetchImpl).login('a@example.com', 'pw');
  assert.equal(calls[0].url, '/auth/login');
  assert.equal(calls[0].method, 'POST');
});

test('login keeps tokens in memory, and logout revokes the refresh token then clears them', async () => {
  const { calls, fetchImpl } = fakeFetch(loginResponse, { status: 204 });
  const client = new AuthClient(fetchImpl);

  const user = await client.login('a@example.com', 'pw');
  assert.equal(user.email, 'a@example.com');
  assert.equal(client.accessToken, 'access');

  await client.logout();
  assert.deepEqual(calls[1], { url: '/auth/logout', method: 'POST', body: { refreshToken: 'refresh' } });
  assert.equal(client.accessToken, null);
});

test('logout signs out locally even when the server is unreachable', async () => {
  const { fetchImpl } = fakeFetch(loginResponse, new TypeError('network down'));
  const client = new AuthClient(fetchImpl);
  await client.login('a@example.com', 'pw');

  await client.logout();

  assert.equal(client.accessToken, null);
});

test('logout without a session makes no request', async () => {
  const { calls, fetchImpl } = fakeFetch();
  await new AuthClient(fetchImpl).logout();
  assert.equal(calls.length, 0);
});

test('maps error codes to fixed messages and never echoes the server message', async () => {
  const cases = [
    [{ status: 401, body: { error: 'INVALID_CREDENTIALS', message: 'x' } }, 'Invalid email or password.'],
    [{ status: 409, body: { error: 'USER_ALREADY_EXISTS', message: 'x' } }, /already exists/],
    [{ status: 400, body: { error: 'INVALID_REQUEST', message: 'x' } }, /Some details were not accepted/],
    [{ status: 500, body: { error: 'INTERNAL_ERROR', message: 'password=secret-canary' } }, 'Something went wrong. Please try again.'],
    [{ status: 502, body: undefined }, 'Something went wrong. Please try again.'],
  ];
  for (const [response, expected] of cases) {
    const { fetchImpl } = fakeFetch(response);
    await assert.rejects(new AuthClient(fetchImpl).login('a@example.com', 'pw'), (error) => {
      assert.ok(error instanceof AuthApiError);
      assert.doesNotMatch(error.userMessage, /canary/);
      if (expected instanceof RegExp) assert.match(error.userMessage, expected);
      else assert.equal(error.userMessage, expected);
      return true;
    });
  }
});

test('a network failure gets a connection message', async () => {
  const { fetchImpl } = fakeFetch(new TypeError('Failed to fetch'));
  await assert.rejects(new AuthClient(fetchImpl).login('a@example.com', 'pw'), { userMessage: /could not reach NextTrade/ });
});

/** An unsigned JWT-shaped token whose payload carries `iat` / `exp` (seconds). */
const tokenWith = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

test('times the access token from its lifetime, so a skewed device clock does not matter', async () => {
  // Issued "an hour ago" by the server's clock, valid 10 minutes -- as a device an hour behind would see it.
  const iat = Math.floor(Date.now() / 1000) - 3600;
  const { fetchImpl } = fakeFetch({ ...loginResponse, body: { ...loginResponse.body, accessToken: tokenWith({ iat, exp: iat + 600 }) } });
  const client = new AuthClient(fetchImpl);
  assert.equal(client.accessTokenExpiresAt, null);

  const before = Date.now();
  await client.login('a@example.com', 'pw');

  const remaining = client.accessTokenExpiresAt - before;
  assert.ok(remaining >= 600_000 && remaining < 605_000, `expected ~10 minutes left, got ${remaining} ms`);
});

test('refresh swaps in the new token pair', async () => {
  const { calls, fetchImpl } = fakeFetch(loginResponse, { status: 200, body: { accessToken: 'access-2', refreshToken: 'refresh-2' } }, { status: 204 });
  const client = new AuthClient(fetchImpl);
  await client.login('a@example.com', 'pw');

  await client.refresh();
  assert.deepEqual(calls[1], { url: '/auth/refresh', method: 'POST', body: { refreshToken: 'refresh' } });
  assert.equal(client.accessToken, 'access-2');

  await client.logout();
  assert.deepEqual(calls[2].body, { refreshToken: 'refresh-2' });
});

test('a rejected refresh (session idle too long) clears the tokens', async () => {
  const { fetchImpl } = fakeFetch(loginResponse, { status: 401, body: { error: 'INVALID_REFRESH_TOKEN', message: 'x' } });
  const client = new AuthClient(fetchImpl);
  await client.login('a@example.com', 'pw');

  await assert.rejects(client.refresh(), { userMessage: 'Your session has ended. Please sign in again.' });
  assert.equal(client.accessToken, null);
});

test('toTraderRegistration converts yes/no answers to booleans and drops blank fields', () => {
  const request = toTraderRegistration(
    { first_name: ' Ada ', apartment: '', accredited_investor: 'false', broker_affiliation: 'true', broker_firm_name: 'true' },
    ' ada@example.com ',
    'pw',
  );
  assert.deepEqual(request, {
    user_role: 'TRADER',
    email: 'ada@example.com',
    password: 'pw',
    first_name: 'Ada',
    accredited_investor: false,
    broker_affiliation: true,
    broker_firm_name: 'true',
  });
});
