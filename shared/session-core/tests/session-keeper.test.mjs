import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INACTIVITY_SIGN_OUT, SessionKeeper, signedOutMessage } from '../src/session-keeper.ts';

const MIN = 60 * 1000;

/** A fake clock, interval, and auth client; access tokens last 10 minutes from each login/refresh. */
function setup() {
  const clock = { now: 0 };
  const client = {
    expiresAt: 10 * MIN,
    refreshes: 0,
    logouts: 0,
    failRefresh: false,
    get accessTokenExpiresAt() {
      return this.expiresAt;
    },
    async refresh() {
      if (this.failRefresh) {
        throw new Error('INVALID_REFRESH_TOKEN');
      }
      this.refreshes++;
      this.expiresAt = clock.now + 10 * MIN;
    },
    async logout() {
      this.logouts++;
    },
  };
  let expired = 0;
  const warnings = [];
  const keeper = new SessionKeeper(client, () => expired++, {
    now: () => clock.now,
    setInterval: () => 'timer',
    clearInterval: () => {},
    onWarning: (secondsLeft) => warnings.push(secondsLeft),
  });
  /** Advance the clock to `minutes`, running the periodic check every `step` seconds on the way. */
  const advanceTo = async (minutes, { activeEvery, step = 15 } = {}) => {
    while (clock.now < minutes * MIN) {
      clock.now += step * 1000;
      if (activeEvery && clock.now % (activeEvery * MIN) === 0) {
        keeper.recordActivity();
      }
      await keeper.check();
    }
  };
  return { clock, client, keeper, advanceTo, expired: () => expired, warnings };
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

/** Run the keeper's once-a-second check `seconds` times. */
async function tick({ clock, keeper }, seconds) {
  for (let i = 0; i < seconds; i++) {
    clock.now += 1000;
    await keeper.check();
  }
}

test('warns 60 seconds before the inactivity sign-out, and not before', async () => {
  const session = setup();
  session.keeper.start();

  await tick(session, 539);
  assert.deepEqual(session.warnings, []);
  assert.equal(session.keeper.secondsLeft, null);

  await tick(session, 1);
  assert.deepEqual(session.warnings, [60]);
  assert.equal(session.keeper.secondsLeft, 60);
  assert.equal(session.expired(), 0);
});

test('counts down each second, then signs out and clears the warning when nobody answers', async () => {
  const session = setup();
  session.keeper.start();

  await tick(session, 599);
  assert.equal(session.keeper.secondsLeft, 1);
  assert.equal(session.expired(), 0);

  await tick(session, 1);
  const countdown = Array.from({ length: 60 }, (_, i) => 60 - i);
  assert.deepEqual(session.warnings, [...countdown, null]);
  assert.equal(session.expired(), 1);
  assert.equal(session.client.logouts, 1);
  assert.equal(session.keeper.running, false);
});

test('"Stay signed in" counts as activity, renews a due token and restarts the full timeout', async () => {
  const session = setup();
  const { keeper, client } = session;
  keeper.start();
  await tick(session, 550);
  assert.equal(keeper.secondsLeft, 50);

  // Stray input (moving between the warning's buttons) does not answer it.
  keeper.recordActivity();
  assert.equal(keeper.secondsLeft, 50);

  keeper.staySignedIn();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(keeper.secondsLeft, null);
  assert.equal(session.warnings.at(-1), null);
  assert.equal(client.refreshes, 1, 'the token was within a minute of expiry, so it is renewed now');

  await tick(session, 539);
  assert.equal(keeper.secondsLeft, null);
  await tick(session, 1);
  assert.equal(keeper.secondsLeft, 60, 'the next warning comes a full timeout after the answer');
  assert.equal(session.expired(), 0);
});

test('ordinary input before the warning still resets the timer', async () => {
  const session = setup();
  session.keeper.start();
  await tick(session, 500);
  session.keeper.recordActivity();
  await tick(session, 100);
  assert.equal(session.keeper.secondsLeft, null);
  assert.equal(session.expired(), 0);
});

test('"Stay signed in" after the deadline (a sleeping laptop) signs out instead', async () => {
  const session = setup();
  session.keeper.start();
  await tick(session, 560);
  session.clock.now = 10 * MIN;

  session.keeper.staySignedIn();

  assert.equal(session.expired(), 1);
  assert.equal(session.keeper.secondsLeft, null);
});

test('"Sign out" stops the keeper and closes the warning without an inactivity sign-out', async () => {
  const session = setup();
  session.keeper.start();
  await tick(session, 570);
  assert.equal(session.keeper.secondsLeft, 30);

  session.keeper.stop();
  session.keeper.staySignedIn();
  await tick(session, 120);

  assert.equal(session.keeper.secondsLeft, null);
  assert.deepEqual(session.warnings.slice(-2), [30, null]);
  assert.equal(session.expired(), 0);
});

test('the timeout and warning lead time stay configurable', async () => {
  const clock = { now: 0 };
  const warnings = [];
  const client = { accessTokenExpiresAt: 60 * MIN, refresh: async () => {}, logout: async () => {} };
  const keeper = new SessionKeeper(client, () => {}, {
    inactivityMs: 2 * MIN,
    warningMs: 30 * 1000,
    now: () => clock.now,
    setInterval: () => 'timer',
    clearInterval: () => {},
    onWarning: (secondsLeft) => warnings.push(secondsLeft),
  });
  keeper.start();
  await tick({ clock, keeper }, 89);
  assert.deepEqual(warnings, []);
  await tick({ clock, keeper }, 1);
  assert.deepEqual(warnings, [30]);
});

test('a keeper without a warning listener still signs out on time', async () => {
  const clock = { now: 0 };
  let expired = 0;
  const client = { accessTokenExpiresAt: 60 * MIN, refresh: async () => {}, logout: async () => {} };
  const keeper = new SessionKeeper(client, () => expired++, {
    now: () => clock.now,
    setInterval: () => 'timer',
    clearInterval: () => {},
  });
  keeper.start();
  await tick({ clock, keeper }, 600);
  assert.equal(expired, 1);
});

test('the sign-in page explains an inactivity sign-out and nothing else', () => {
  assert.equal(
    signedOutMessage(INACTIVITY_SIGN_OUT),
    'You were signed out after 10 minutes of inactivity. Please sign in again.',
  );
  assert.equal(signedOutMessage(null), '');
  assert.equal(signedOutMessage('something-else'), '');
});
