import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
import { ApiHttpClient } from './component-helper.mjs';
import { of } from 'rxjs';
const { TradingWorkspace } = await import('../src/app/trading-workspace.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { AppSessionService } = await import('../src/app/app-session.service.ts');

const SIGN_IN_AGAIN = 'Your profile could not be loaded. Please sign in again.';
const TRY_AGAIN = 'Your profile could not be loaded. Please try again.';
const marketStatus = { open: false, exchangeTimeZone: 'America/Chicago', nextOpen: '2026-10-23T13:30:00Z', nextClose: '2026-10-23T20:00:00Z' };
const profile = { id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', phone: '555-0100', address: '1 Main St' };

/** A JWT-shaped token whose payload segment is base64url-encoded claims. */
function token(claims) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}

/** Replaces global fetch for one test, recording every call. */
function fakeFetch(t, respond) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  });
  return calls;
}

async function settle(fixture) {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
  fixture.detectChanges();
}

async function workspace(t, accessToken) {
  const fixture = await render(t, TradingWorkspace, {}, [
    { provide: AuthService, useValue: { accessToken, email: 'ada@example.test', traderLevel: 'NOVICE' } },
    { provide: AppSessionService, useValue: { logout: async () => {} } },
    // The dashboards read the market status after the first render; answer it with a real shape.
    { provide: ApiHttpClient, useValue: { get: url => of(url.endsWith('/market/status') ? marketStatus : []), post: () => of({}) } },
  ]);
  await settle(fixture);
  const component = fixture.componentInstance;
  const dashboard = fixture.debugElement.children[0].componentInstance;
  return { fixture, component, dashboard };
}

test('workspace loads the signed-in user profile with the bearer token and hands it to the dashboard', async t => {
  const accessToken = token({ sub: 'user-1' });
  const calls = fakeFetch(t, () => new Response(JSON.stringify(profile), { status: 200 }));

  const { component, dashboard } = await workspace(t, accessToken);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/auth/users/user-1');
  assert.deepEqual(calls[0].init.headers, { Authorization: `Bearer ${accessToken}` });
  assert.deepEqual(component.profile(), profile);
  assert.equal(component.profileError(), '');
  assert.equal(component.profileLoading(), false);
  assert.deepEqual(dashboard.profile(), profile);
  assert.equal(dashboard.profileLoading(), false);
});

test('workspace shows loading until the profile request finishes', async t => {
  let release;
  fakeFetch(t, () => new Promise(resolve => { release = () => resolve(new Response(JSON.stringify(profile), { status: 200 })); }));

  const { fixture, component, dashboard } = await workspace(t, token({ sub: 'user-1' }));

  assert.equal(component.profileLoading(), true);
  assert.equal(dashboard.profileLoading(), true);
  assert.equal(component.profile(), null);
  release();
  await settle(fixture);
  assert.equal(component.profileLoading(), false);
  assert.deepEqual(dashboard.profile(), profile);
});

test('workspace URL-encodes the user id and decodes base64url claims', async t => {
  // A subject whose base64url payload contains both "-" and "_".
  const sub = 'a/b?c>>>~~~???';
  const accessToken = token({ sub });
  assert.match(accessToken.split('.')[1], /-/);
  assert.match(accessToken.split('.')[1], /_/);
  const calls = fakeFetch(t, () => new Response(JSON.stringify(profile), { status: 200 }));

  await workspace(t, accessToken);

  assert.equal(calls[0].url, `/auth/users/${encodeURIComponent(sub)}`);
});

test('workspace reports a retryable error when the profile request fails', async t => {
  for (const status of [401, 404, 500]) {
    await t.test(`HTTP ${status}`, async t => {
      fakeFetch(t, () => new Response(JSON.stringify({ error: 'nope' }), { status }));

      const { component, dashboard } = await workspace(t, token({ sub: 'user-1' }));

      assert.equal(component.profile(), null);
      assert.equal(component.profileError(), TRY_AGAIN);
      assert.equal(dashboard.profileError(), TRY_AGAIN);
      assert.equal(component.profileLoading(), false);
    });
  }
});

test('workspace asks the user to sign in again, without calling the server, for an unusable token', async t => {
  const cases = {
    'no token': null,
    'an empty token': '',
    'a token without a payload segment': 'only-one-part',
    'a token with an empty payload segment': 'header..signature',
    'a payload that is not base64 JSON': 'header.%%%not-base64%%%.signature',
    'a payload that is base64 but not JSON': `header.${Buffer.from('not json').toString('base64url')}.signature`,
    'claims without a subject': token({ email: 'ada@example.test' }),
    'a numeric subject': token({ sub: 42 }),
  };
  for (const [label, accessToken] of Object.entries(cases)) {
    await t.test(label, async t => {
      const calls = fakeFetch(t, () => assert.fail('fetch should not be called'));

      const { component, dashboard } = await workspace(t, accessToken);

      assert.equal(calls.length, 0);
      assert.equal(component.profileError(), SIGN_IN_AGAIN);
      assert.equal(dashboard.profileError(), SIGN_IN_AGAIN);
      assert.equal(component.profileLoading(), false);
      assert.equal(component.profile(), null);
    });
  }
});

test('workspace reports the network error message when fetch rejects with an Error', async t => {
  fakeFetch(t, () => { throw new TypeError('Failed to fetch'); });

  const { component } = await workspace(t, token({ sub: 'user-1' }));

  assert.equal(component.profileError(), 'Failed to fetch');
  assert.equal(component.profileLoading(), false);
});

test('workspace falls back to a generic message when something other than an Error is thrown', async t => {
  fakeFetch(t, () => { throw 'offline'; });

  const { component } = await workspace(t, token({ sub: 'user-1' }));

  assert.equal(component.profileError(), 'Profile details could not be loaded.');
  assert.equal(component.profileLoading(), false);
});
