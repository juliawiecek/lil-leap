import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthApiError, AuthClient } from '../src/auth-api.ts';

/** Records requests and answers each with the next queued response. */
function fakeFetch(...responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) {
      throw next;
    }
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
    });
  };
  return { calls, fetchImpl };
}

const loginResponse = {
  status: 200,
  body: {
    accessToken: 'access',
    refreshToken: 'refresh',
    user: { id: 'u1', email: 'a@example.com', userRole: 'TRADER' },
  },
};

test('calls same-origin /auth paths so nginx can proxy them without CORS', async () => {
  const { calls, fetchImpl } = fakeFetch(loginResponse);
  await new AuthClient(fetchImpl).login('a@example.com', 'pw');
  assert.equal(calls[0].url, '/auth/login');
  assert.equal(calls[0].method, 'POST');
});

test('loads the authenticated user profile with its bearer token', async () => {
  const token = tokenWith({ sub: 'u1' });
  const { calls, fetchImpl } = fakeFetch(
    { ...loginResponse, body: { ...loginResponse.body, accessToken: token, user: { ...loginResponse.body.user, id: 'u1' } } },
    { status: 200, body: { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', address: '1 Main St', email: 'a@example.com', phone: '555-0100' } },
  );
  const client = new AuthClient(fetchImpl);

  await client.login('a@example.com', 'pw');
  await client.getProfile();

  assert.equal(calls[1].url, '/auth/users/u1');
  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[1].body, undefined);
});

test('keeps the signed-in user id from the login response', async () => {
  const { fetchImpl } = fakeFetch(loginResponse);
  const client = new AuthClient(fetchImpl);

  await client.login('a@example.com', 'pw');

  assert.equal(client.userId, 'u1');
});

test('login keeps tokens in memory, and logout revokes the refresh token then clears them', async () => {
  const { calls, fetchImpl } = fakeFetch(loginResponse, { status: 204 });
  const client = new AuthClient(fetchImpl);

  const user = await client.login('a@example.com', 'pw');
  assert.equal(user.email, 'a@example.com');
  assert.equal(client.accessToken, 'access');

  await client.logout();
  assert.deepEqual(calls[1], {
    url: '/auth/logout',
    method: 'POST',
    body: { refreshToken: 'refresh' },
  });
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
    [
      { status: 401, body: { error: 'INVALID_CREDENTIALS', message: 'x' } },
      'Invalid email or password.',
    ],
    [{ status: 409, body: { error: 'USER_ALREADY_EXISTS', message: 'x' } }, /already exists/],
    [
      { status: 400, body: { error: 'INVALID_REQUEST', message: 'x' } },
      /Some details were not accepted/,
    ],
    [
      { status: 422, body: { error: 'INSUFFICIENT_INVESTABLE_ASSETS', message: 'x' } },
      /minimum of \$5,000 in investable assets/,
    ],
    [
      { status: 500, body: { error: 'INTERNAL_ERROR', message: 'password=secret-canary' } },
      'Something went wrong. Please try again.',
    ],
    [{ status: 502, body: undefined }, 'Something went wrong. Please try again.'],
  ];
  for (const [response, expected] of cases) {
    const { fetchImpl } = fakeFetch(response);
    await assert.rejects(new AuthClient(fetchImpl).login('a@example.com', 'pw'), (error) => {
      assert.ok(error instanceof AuthApiError);
      assert.doesNotMatch(error.userMessage, /canary/);
      if (expected instanceof RegExp) {
        assert.match(error.userMessage, expected);
      } else {
        assert.equal(error.userMessage, expected);
      }
      return true;
    });
  }
});

test('a network failure gets a connection message', async () => {
  const { fetchImpl } = fakeFetch(new TypeError('Failed to fetch'));
  await assert.rejects(new AuthClient(fetchImpl).login('a@example.com', 'pw'), {
    userMessage: /could not reach NextTrade/,
  });
});

/** An unsigned JWT-shaped token whose payload carries `iat` / `exp` (seconds). */
const tokenWith = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

test('times the access token from its lifetime, so a skewed device clock does not matter', async () => {
  // Issued "an hour ago" by the server's clock, valid 10 minutes -- as a device an hour behind would see it.
  const iat = Math.floor(Date.now() / 1000) - 3600;
  const { fetchImpl } = fakeFetch({
    ...loginResponse,
    body: { ...loginResponse.body, accessToken: tokenWith({ iat, exp: iat + 600 }) },
  });
  const client = new AuthClient(fetchImpl);
  assert.equal(client.accessTokenExpiresAt, null);

  const before = Date.now();
  await client.login('a@example.com', 'pw');

  const remaining = client.accessTokenExpiresAt - before;
  assert.ok(
    remaining >= 600_000 && remaining < 605_000,
    `expected ~10 minutes left, got ${remaining} ms`,
  );
});

test('reads the server-assigned tier from the access token, and forgets it on logout', async () => {
  const { fetchImpl } = fakeFetch(
    {
      ...loginResponse,
      body: { ...loginResponse.body, accessToken: tokenWith({ trader_level: 'ADVANCED' }) },
    },
    { status: 204 },
  );
  const client = new AuthClient(fetchImpl);
  assert.equal(client.traderLevel, null);

  await client.login('a@example.com', 'pw');
  assert.equal(client.traderLevel, 'ADVANCED');

  await client.logout();
  assert.equal(client.traderLevel, null);
});

test('ignores a missing or unknown trader_level claim', async () => {
  for (const claims of [{}, { trader_level: 'EXPERT' }]) {
    const { fetchImpl } = fakeFetch({
      ...loginResponse,
      body: { ...loginResponse.body, accessToken: tokenWith(claims) },
    });
    const client = new AuthClient(fetchImpl);
    await client.login('a@example.com', 'pw');
    assert.equal(client.traderLevel, null);
  }
});

test('refresh swaps in the new token pair', async () => {
  const { calls, fetchImpl } = fakeFetch(
    loginResponse,
    { status: 200, body: { accessToken: 'access-2', refreshToken: 'refresh-2' } },
    { status: 204 },
  );
  const client = new AuthClient(fetchImpl);
  await client.login('a@example.com', 'pw');

  await client.refresh();
  assert.deepEqual(calls[1], {
    url: '/auth/refresh',
    method: 'POST',
    body: { refreshToken: 'refresh' },
  });
  assert.equal(client.accessToken, 'access-2');

  await client.logout();
  assert.deepEqual(calls[2].body, { refreshToken: 'refresh-2' });
});

test('a rejected refresh (session idle too long) clears the tokens', async () => {
  const { fetchImpl } = fakeFetch(loginResponse, {
    status: 401,
    body: { error: 'INVALID_REFRESH_TOKEN', message: 'x' },
  });
  const client = new AuthClient(fetchImpl);
  await client.login('a@example.com', 'pw');

  await assert.rejects(client.refresh(), {
    userMessage: 'Your session has ended. Please sign in again.',
  });
  assert.equal(client.accessToken, null);
});

test('password reset calls post the email, then the token and new password, and accept empty 202/204 replies', async () => {
  const { calls, fetchImpl } = fakeFetch({ status: 202 }, { status: 204 });
  const client = new AuthClient(fetchImpl);

  await client.requestPasswordReset('a@example.com');
  await client.resetPassword('link-value', 'NewPassword1!');

  assert.deepEqual(calls, [
    { url: '/auth/forgot-password', method: 'POST', body: { email: 'a@example.com' } },
    { url: '/auth/reset-password', method: 'POST', body: { token: 'link-value', newPassword: 'NewPassword1!' } },
  ]);
});

test('an invalid, expired or used reset link gets a plain message asking for a new one', async () => {
  const { fetchImpl } = fakeFetch({ status: 400, body: { error: 'INVALID_RESET_TOKEN', message: 'server text' } });

  await assert.rejects(new AuthClient(fetchImpl).resetPassword('stale', 'NewPassword1!'), (error) => {
    assert.ok(error instanceof AuthApiError);
    assert.match(error.userMessage, /invalid, expired or already used/);
    return true;
  });
});
