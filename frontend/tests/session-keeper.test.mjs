import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionKeeper } from '../src/app/session-keeper.ts';

const MIN = 60 * 1000;

/** A fake clock, interval, and auth client; access tokens last 10 minutes from each login/refresh. */
function setup() {
  const clock = { now: 0 };
  const client = {
    expiresAt: 10 * MIN,
    refreshes: 0,
    logouts: 0,
    failRefresh: false,
    get accessTokenExpiresAt() { return this.expiresAt; },
    async refresh() {
      if (this.failRefresh) throw new Error('INVALID_REFRESH_TOKEN');
      this.refreshes++;
      this.expiresAt = clock.now + 10 * MIN;
    },
    async logout() { this.logouts++; },
  };
  let expired = 0;
  const keeper = new SessionKeeper(client, () => expired++, {
    now: () => clock.now,
    setInterval: () => 'timer',
    clearInterval: () => {},
  });
  /** Advance the clock to `minutes`, running the periodic check every 15 seconds on the way. */
  const advanceTo = async (minutes, { activeEvery } = {}) => {
    while (clock.now < minutes * MIN) {
      clock.now += 15 * 1000;
      if (activeEvery && clock.now % (activeEvery * MIN) === 0) keeper.recordActivity();
      await keeper.check();
    }
  };
  return { clock, client, keeper, advanceTo, expired: () => expired };
}

test('signs an idle user out after 10 minutes and revokes the session', async () => {
  const { client, keeper, advanceTo, expired } = setup();
  keeper.start();

  await advanceTo(9.75);
  assert.equal(expired(), 0);

  await advanceTo(10);
  assert.equal(expired(), 1);
  assert.equal(client.logouts, 1);
  assert.equal(keeper.running, false);
});

test('keeps an active user signed in by refreshing before the access token expires', async () => {
  const { client, keeper, advanceTo, expired } = setup();
  keeper.start();

  await advanceTo(35, { activeEvery: 3 });

  assert.equal(expired(), 0);
  assert.ok(client.refreshes >= 3, `expected several refreshes, got ${client.refreshes}`);
  assert.equal(keeper.running, true);
});

test('measures inactivity from the last input, not the last refresh', async () => {
  const { keeper, advanceTo, expired } = setup();
  keeper.start();

  await advanceTo(5);
  keeper.recordActivity(); // last input at minute 5
  await advanceTo(14.75);
  assert.equal(expired(), 0);

  await advanceTo(15);
  assert.equal(expired(), 1);
});

test('does not refresh for a user who has been idle since the last refresh', async () => {
  const { client, keeper, advanceTo } = setup();
  keeper.start();

  await advanceTo(9.5);

  assert.equal(client.refreshes, 0);
});

test('signs out when the server rejects the refresh (session already ended)', async () => {
  const { client, keeper, advanceTo, expired } = setup();
  keeper.start();
  client.failRefresh = true;

  await advanceTo(9.5, { activeEvery: 1 });

  assert.equal(expired(), 1);
  assert.equal(keeper.running, false);
});

test('stop() prevents any later sign-out', async () => {
  const { keeper, advanceTo, expired } = setup();
  keeper.start();
  keeper.stop();

  await advanceTo(20);

  assert.equal(expired(), 0);
});
