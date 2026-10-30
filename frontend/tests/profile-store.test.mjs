import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';

const { ProfileStore } = await import('../src/app/profile-store.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const token = claims => 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
const profile = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' };
const storeFor = (t, accessToken) => component(t, ProfileStore, [{ provide: AuthService, useValue: { accessToken } }]);

test('profile loading authenticates the selected user, exposes progress and merges saved changes', async t => {
  const accessToken = token({ sub: 'user/123' });
  const store = storeFor(t, accessToken);
  store.update({ firstName: 'Ignored until loaded' });
  assert.equal(store.profile(), null);
  let finish;
  const request = t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  store.error.set('Previous failure');
  const loading = store.load();
  assert.equal(store.loading(), true);
  assert.equal(store.error(), '');
  assert.deepEqual(request.mock.calls[0].arguments, ['/auth/users/user%2F123', {
    headers: { Authorization: `Bearer ${accessToken}` },
  }]);
  finish(Response.json(profile));
  await loading;
  assert.deepEqual(store.profile(), profile);
  assert.equal(store.loading(), false);
  store.update({ firstName: 'Augusta' });
  assert.deepEqual(store.profile(), { ...profile, firstName: 'Augusta' });
});

for (const accessToken of [null, 'invalid', 'header.not-json.signature', token({ sub: 123 }), token({})]) {
  test('profile loading rejects an absent or invalid user identity without requesting a profile: ' + String(accessToken), async t => {
    const store = storeFor(t, accessToken);
    const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not request a profile'); });
    await store.load();
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(store.profile(), null);
    assert.match(store.error(), /Please sign in again/);
    assert.equal(store.loading(), false);
  });
}

test('a failed profile response preserves the displayed profile and a retry clears its error', async t => {
  const store = storeFor(t, token({ sub: 'user-123' }));
  store.profile.set(profile);
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await store.load();
  assert.deepEqual(store.profile(), profile);
  assert.match(store.error(), /Please try again/);
  assert.equal(store.loading(), false);
  fetch.mock.mockImplementation(async () => Response.json({ ...profile, lastName: 'Byron' }));
  await store.load();
  assert.equal(store.error(), '');
  assert.equal(store.profile().lastName, 'Byron');
});

test('unexpected profile request failures release loading and report a useful fallback', async t => {
  const store = storeFor(t, token({ sub: 'user-123' }));
  t.mock.method(globalThis, 'fetch', () => Promise.reject('Network unavailable'));
  await store.load();
  assert.equal(store.error(), 'Profile details could not be loaded.');
  assert.equal(store.loading(), false);
});
