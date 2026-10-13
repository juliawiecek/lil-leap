import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthClient } from '../src/auth-api.ts';
import { SessionKeeper } from '../src/session-keeper.ts';

test('invalidation listeners unsubscribe and signed-out input cannot persist activity', async () => {
  const f = fixture();
  let notifications = 0;
  assert.equal(await f.client.restoreSession(), false);
  const unsubscribe = f.client.onInvalidated(() => {
    notifications++;
  });
  await f.client.login('a', 'b');
  await f.client.logout();
  assert.equal(notifications, 1);
  f.client.recordActivity();
  assert.equal(f.values.size, 0);
  unsubscribe();
  await f.client.logout();
  assert.equal(notifications, 1);
});

for (const exchange of ['login', 'refresh']) {
  test('a late ' + exchange + ' stays signed out even when revoking its token fails', async () => {
    const f = fixture();
    await f.client.login('a', 'b');
    let resolve;
    const client = new AuthClient(
      (url) =>
        url.endsWith('/' + exchange)
          ? new Promise((done) => {
              resolve = done;
            })
          : Promise.reject(new Error('Offline')),
      '/auth',
      f.settings,
    );
    const pending = exchange === 'login' ? client.login('a', 'b') : client.restoreSession();
    await client.logout();
    resolve(
      Response.json({
        accessToken: token('TRADER'),
        refreshToken: 'late',
        user: { userRole: 'TRADER' },
      }),
    );
    if (exchange === 'login') {
      await assert.rejects(pending, /session has ended/);
    } else {
      assert.equal(await pending, false);
    }
    await new Promise((done) => setImmediate(done));
    assert.equal(client.accessToken, null);
    assert.equal(f.values.size, 0);
  });
}

test('unreadable token claims and malformed error codes never expose server details', async () => {
  const client = new AuthClient(
    async () =>
      Response.json({ accessToken: 'test.broken.test', refreshToken: 'test-refresh', user: {} }),
    '/auth',
    { storage: null },
  );
  await client.login('a', 'b');
  assert.equal(client.accessTokenExpiresAt, null);
  assert.equal(client.userRole, null);
  assert.equal(client.email, null);
  const rejected = new AuthClient(async () =>
    Response.json({ error: 123, message: 'private server details' }, { status: 400 }),
  );
  await assert.rejects(
    rejected.login('a', 'b'),
    (error) => error.message === 'Something went wrong. Please try again.',
  );
});

test('registration sends profile data without opening a session', async () => {
  let sent;
  const client = new AuthClient(async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return new Response(null, { status: 204 });
  });
  await client.register({ email: 'a@example.test', password: 'test-password' });
  assert.equal(sent.url, '/auth/register');
  assert.equal(sent.body.email, 'a@example.test');
  assert.equal(client.accessToken, null);
});

test('a signed-in client needs no restoration exchange and refresh requires a session', async () => {
  const f = fixture();
  await assert.rejects(f.client.refresh(), /session has ended/);
  await f.client.login('a', 'b');
  assert.equal(await f.client.restoreSession(), true);
  assert.equal(f.calls.length, 1);
});

test('a blocked browser storage getter still permits memory-only login', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('Storage blocked');
    },
  });
  try {
    const f = fixture();
    const client = new AuthClient(f.fetch);
    await client.login('a', 'b');
    assert.ok(client.accessToken);
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    } else {
      delete globalThis.sessionStorage;
    }
  }
});

test('restoration completing after the idle deadline cannot reopen the session', async () => {
  const f = fixture();
  await f.client.login('a', 'b');
  let resolve;
  const client = new AuthClient(
    (url) =>
      url.endsWith('/refresh')
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(new Response(null, { status: 204 })),
    '/auth',
    f.settings,
  );
  const pending = client.restoreSession();
  f.setNow(1600000);
  resolve(Response.json({ accessToken: token('TRADER'), refreshToken: 'rotated' }));
  assert.equal(await pending, false);
  assert.equal(client.accessToken, null);
  assert.equal(f.values.size, 0);
});

const token = (role) =>
  'test.' +
  Buffer.from(
    JSON.stringify({
      exp: 1600,
      iat: 1000,
      user_role: role,
      email: 'user@example.test',
      trader_level: role === 'TRADER' ? 'ADVANCED' : undefined,
      risk_profile: 'MODERATE',
    }),
  ).toString('base64url') +
  '.test';
function fixture(options = {}) {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let now = 1000000;
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return url.endsWith('/logout')
      ? new Response(null, { status: 204 })
      : Response.json({
          accessToken: token('TRADER'),
          refreshToken: url.endsWith('/login') ? 'first-secret' : 'rotated-secret',
          user: { email: 'user@example.test', userRole: 'TRADER' },
        });
  };
  const settings = { storage, storageKey: 'test-session', now: () => now, ...options };
  return {
    values,
    storage,
    calls,
    settings,
    fetch,
    setNow: (value) => {
      now = value;
    },
    client: new AuthClient(fetch, '/auth', settings),
  };
}

test('a new client restores a rotated refresh token without persisting access tokens or resetting activity', async () => {
  const f = fixture();
  await f.client.login('user@example.test', 'secret-password');
  assert.deepEqual(JSON.parse(f.values.get('test-session')), {
    version: 1,
    refreshToken: 'first-secret',
    lastActivityAt: 1000000,
  });
  f.setNow(1540000); // Nine idle minutes, one remains.
  const restored = new AuthClient(f.fetch, '/auth', f.settings);
  assert.equal(restored.accessToken, null);
  assert.equal(await restored.restoreSession(), true);
  assert.equal(restored.lastActivityAt, 1000000);
  assert.equal(restored.userRole, 'TRADER');
  assert.equal(restored.email, 'user@example.test');
  assert.equal(restored.riskProfile, 'MODERATE');
  assert.equal(restored.traderLevel, 'ADVANCED');
  assert.equal(JSON.parse(f.values.get('test-session')).refreshToken, 'rotated-secret');
  assert.equal(f.calls.filter((call) => call.url.endsWith('/refresh')).length, 1);
  let expired = 0;
  const keeper = new SessionKeeper(restored, () => expired++, {
    now: f.settings.now,
    setInterval: () => 1,
    clearInterval: () => {
      /* The test fixture has no external side effects. */
    },
  });
  keeper.start(restored.lastActivityAt);
  f.setNow(1600000);
  await keeper.check();
  assert.equal(expired, 1);
  assert.equal(restored.accessToken, null);
  assert.equal(f.values.size, 0);
});

test('activity survives another reload while token refresh alone does not extend inactivity', async () => {
  const f = fixture();
  await f.client.login('a', 'b');
  f.setNow(1200000);
  f.client.recordActivity();
  f.setNow(1300000);
  await f.client.refresh();
  assert.equal(JSON.parse(f.values.get('test-session')).lastActivityAt, 1200000);
  const restored = new AuthClient(f.fetch, '/auth', f.settings);
  await restored.restoreSession();
  assert.equal(restored.lastActivityAt, 1200000);
});

test('expired stored sessions are cleared without exchanging their refresh token', async () => {
  const f = fixture();
  await f.client.login('a', 'b');
  f.setNow(1600000);
  const restored = new AuthClient(f.fetch, '/auth', f.settings);
  assert.equal(await restored.restoreSession(), false);
  assert.equal(f.values.size, 0);
  assert.equal(
    f.calls.some((call) => call.url.endsWith('/refresh')),
    false,
  );
});

for (const record of [
  'not JSON',
  '{}',
  JSON.stringify({ version: 1, refreshToken: 'secret', lastActivityAt: 'now' }),
  JSON.stringify({ version: 1, refreshToken: 'secret', lastActivityAt: 2000000 }),
]) {
  test('malformed or future-dated persistence cannot restore: ' + record.slice(0, 18), async () => {
    const f = fixture();
    f.values.set('test-session', record);
    assert.equal(await f.client.restoreSession(), false);
    assert.equal(f.values.size, 0);
    assert.equal(f.calls.length, 0);
  });
}

test('storage-disabled users can sign in but cannot restore in a new client', async () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  const f = fixture({ storage });
  await f.client.login('a', 'b');
  assert.ok(f.client.accessToken);
  assert.equal(await new AuthClient(f.fetch, '/auth', f.settings).restoreSession(), false);
});

test('server rejection clears both tokens and persisted session', async () => {
  const f = fixture();
  await f.client.login('a', 'b');
  const restored = new AuthClient(
    async () => Response.json({ error: 'INVALID_REFRESH_TOKEN' }, { status: 401 }),
    '/auth',
    f.settings,
  );
  assert.equal(await restored.restoreSession(), false);
  assert.equal(restored.accessToken, null);
  assert.equal(f.values.size, 0);
});

test('startup requests time out even if fetch ignores its abort signal', async () => {
  const f = fixture({ requestTimeoutMs: 5 });
  await f.client.login('a', 'b');
  const restored = new AuthClient(
    () =>
      new Promise(() => {
        /* The test fixture has no external side effects. */
      }),
    '/auth',
    f.settings,
  );
  assert.equal(await restored.restoreSession(), false);
  assert.equal(f.values.size, 0);
});

test('concurrent restoration and refresh callers exchange a token once', async () => {
  const f = fixture();
  await f.client.login('a', 'b');
  let resolve;
  let calls = 0;
  const client = new AuthClient(
    () => {
      calls++;
      return new Promise((done) => {
        resolve = done;
      });
    },
    '/auth',
    f.settings,
  );
  const first = client.restoreSession(),
    second = client.restoreSession(),
    third = client.refresh();
  resolve(Response.json({ accessToken: token('TRADER'), refreshToken: 'rotated' }));
  assert.equal(await first, true);
  assert.equal(await second, true);
  await third;
  assert.equal(calls, 1);
});

test('a late rotation cannot sign a user back in after logout', async () => {
  const f = fixture();
  await f.client.login('a', 'b');
  let resolve;
  const client = new AuthClient(
    (url) =>
      url.endsWith('/refresh')
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(new Response(null, { status: 204 })),
    '/auth',
    f.settings,
  );
  const pending = client.restoreSession();
  await client.logout();
  resolve(Response.json({ accessToken: token('TRADER'), refreshToken: 'late' }));
  assert.equal(await pending, false);
  assert.equal(client.accessToken, null);
  assert.equal(f.values.size, 0);
});

test('a delayed startup response cannot erase a newer login', async () => {
  const f = fixture();
  await f.client.login('a', 'b');
  let resolve;
  const client = new AuthClient(
    (url) =>
      url.endsWith('/refresh')
        ? new Promise((done) => {
            resolve = done;
          })
        : url.endsWith('/login')
          ? Promise.resolve(
              Response.json({
                accessToken: token('ANALYST'),
                refreshToken: 'new-login',
                user: { userRole: 'ANALYST', email: 'user@example.test' },
              }),
            )
          : Promise.resolve(new Response(null, { status: 204 })),
    '/auth',
    f.settings,
  );
  const pending = client.restoreSession();
  await client.login('a', 'b');
  resolve(Response.json({ accessToken: token('TRADER'), refreshToken: 'late' }));
  assert.equal(await pending, false);
  assert.equal(client.userRole, 'ANALYST');
  assert.equal(JSON.parse(f.values.get('test-session')).refreshToken, 'new-login');
});

test('a request sent with an old token cannot invalidate the newly rotated session', async () => {
  const f = fixture();
  await f.client.login('a', 'b');
  f.client.unauthorized('older-token');
  assert.ok(f.client.accessToken);
  f.client.unauthorized(f.client.accessToken);
  assert.equal(f.client.accessToken, null);
  assert.equal(f.values.size, 0);
});

test('late input and a backgrounded page check cannot revive an already idle session', async () => {
  let now = 0;
  let expired = 0;
  const activity = [];
  const client = { accessTokenExpiresAt: 9999999, async refresh() {}, async logout() {} };
  const keeper = new SessionKeeper(client, () => expired++, {
    now: () => now,
    inactivityMs: 100,
    onActivity: (at) => activity.push(at),
    setInterval: () => 1,
    clearInterval() {},
  });
  keeper.start(0);
  now = 90;
  keeper.recordActivity();
  assert.deepEqual(activity, [90]);
  now = 190;
  keeper.recordActivity();
  assert.equal(expired, 1);
  assert.deepEqual(activity, [90]);
});

test('a refresh failure from a stopped keeper cannot end a newly started session', async () => {
  let now = 0;
  let reject;
  let expired = 0;
  const client = {
    accessTokenExpiresAt: 10,
    refresh: () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
    async logout() {},
  };
  const keeper = new SessionKeeper(client, () => expired++, {
    now: () => now,
    setInterval: () => 1,
    clearInterval() {},
  });
  keeper.start();
  now = 1;
  keeper.recordActivity();
  const pending = keeper.check();
  keeper.stop();
  now = 2;
  keeper.start();
  reject(new Error('old session ended'));
  await pending;
  assert.equal(keeper.running, true);
  assert.equal(expired, 0);
  keeper.stop();
});
