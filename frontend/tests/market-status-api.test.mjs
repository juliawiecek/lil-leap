import { apiHttp } from './http-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './component-helper.mjs';
const { MarketStatusClient, countdown, marketStatusText } = await import('../src/app/market-status-api.ts');
import { throwError } from 'rxjs';

test('unexpected transport failures propagate from market status', async () => {
  const failure = new TypeError('offline');
  const client = new MarketStatusClient({ accessToken: 'token' }, { get: () => throwError(() => failure) });
  await assert.rejects(client.status(), error => error === failure);
});

const now = new Date('2026-10-14T17:46:00Z');
const status = (open, nextOpen, nextClose) => ({ open, exchangeTimeZone: 'America/New_York', nextOpen, nextClose });

test('countdown shows hours and minutes until the next boundary', () => {
  assert.equal(countdown(new Date('2026-10-14T20:00:00Z'), now), '2h 14m');
  assert.equal(countdown(new Date('2026-10-14T18:31:30Z'), now), '45m');
  assert.equal(countdown(new Date('2026-10-14T17:46:30Z'), now), 'under 1m');
});

test('open, closed-soon and closed-for-the-weekend each read naturally', () => {
  assert.equal(marketStatusText(status(true, '2026-10-15T13:30:00Z', '2026-10-14T20:00:00Z'), now), 'Market closes in 2h 14m');
  assert.equal(marketStatusText(status(false, '2026-10-14T20:51:00Z', '2026-10-14T21:00:00Z'), now), 'Market opens in 3h 5m');
  const weekend = marketStatusText(status(false, '2026-10-19T13:30:00Z', '2026-10-19T20:00:00Z'), new Date('2026-10-16T21:00:00Z'), 'en-US');
  assert.match(weekend, /^Market closed · Opens Mon \d{1,2}:30 (AM|PM)$/);
  assert.equal(marketStatusText(null, now), 'Market status unavailable');
});

test('the client uses the shared transport and reports failures', async () => {
  let seen;
  const body = status(true, '2026-10-15T13:30:00Z', '2026-10-14T20:00:00Z');
  const ok = new MarketStatusClient({ accessToken: 't' }, apiHttp(async (url, init) => {
    seen = { url, auth: init.headers.Authorization };
    return { ok: true, status: 200, json: async () => body };
  }));
  assert.deepEqual(await ok.status(), body);
  assert.deepEqual(seen, { url: '/api/v1/market/status', auth: undefined });

  await assert.rejects(new MarketStatusClient({ accessToken: null }).status(), /Sign in/);
  let expired = null;
  const failing = new MarketStatusClient({ accessToken: 'old', unauthorized: token => { expired = token; } },
    apiHttp(async () => ({ ok: false, status: 401, json: async () => ({}) })));
  await assert.rejects(failing.status(), /Could not load the market status/);
  assert.equal(expired, null); // Only the interceptor invalidates sessions.
});
