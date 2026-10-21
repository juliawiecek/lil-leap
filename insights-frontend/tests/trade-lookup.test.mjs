import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, input } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
import { Subject } from 'rxjs';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
const { TradeLookupPage } = await import('../src/app/pages/trade-lookup/trade-lookup-page.ts');
const { tradeCase, notionalCents, cents } = await import('../src/app/pages/trade-lookup/trade-case.ts');
const { TRADE_TRAIL } = await import('../src/app/trade-trail.ts');

const ID = '3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f';
const at = (minute) => `2026-10-19T14:${String(minute).padStart(2, '0')}:00Z`;
/** A buy of 5 shares at 225.3219 that settled correctly: -1126.6095 rounds to -1126.61. */
const filled = {
  orderId: ID,
  auditRecorded: true,
  events: [
    { source: 'STATUS', type: 'SUBMITTED', actor: null, occurredAt: at(1), details: { reasonCode: 'SUBMISSION_VALIDATED' } },
    { source: 'AUDIT', type: 'ORDER_ACCEPTED', actor: 'SYSTEM', occurredAt: at(2), details: { payload: '{"status":"ACCEPTED"}' } },
    { source: 'FILL', type: 'FILLED', actor: null, occurredAt: at(3), details: { quantity: 5, price: '225.3219' } },
    { source: 'HOLDING', type: 'BUY', actor: null, occurredAt: at(3), details: { quantityChange: 5, costBasis: '225.3219' } },
    { source: 'CASH', type: 'BUY', actor: null, occurredAt: at(3), details: { amount: '-1126.61', currency: 'USD' } },
    { source: 'STATUS', type: 'FILLED', actor: null, occurredAt: at(3), details: { reasonCode: 'EXECUTION_SUCCESS' } },
  ],
};
const failed = (summary) => summary.checks.filter((check) => !check.ok).map((check) => check.label);

test('amounts are exact to the cent, rounded half-up like settlement', () => {
  assert.equal(notionalCents('5', '225.3219'), 112661n);
  assert.equal(notionalCents('3', '10.005'), 3002n, '30.015 rounds up to 30.02');
  assert.equal(notionalCents('2', '10.5'), 2100n);
  assert.equal(notionalCents('2', 'abc'), null);
  assert.equal(cents('-1126.61'), -112661n);
  assert.equal(cents('12.5'), 1250n);
  assert.equal(cents('12.345'), null);
});

test('a correctly settled fill passes every record check', () => {
  const summary = tradeCase(filled);
  assert.equal(summary.status, 'FILLED');
  assert.equal(summary.side, 'BUY');
  assert.equal(summary.quantity, '5');
  assert.equal(summary.cashDelta, '-1126.61');
  assert.deepEqual(failed(summary), []);
  assert.match(summary.checks.find((check) => check.label === 'Cash matches fill').detail, /-1126\.61 USD = 5 × 225\.3219/);
});

test('missing or mismatched settlement parts are flagged for review', () => {
  const withoutCash = { ...filled, events: filled.events.filter((event) => event.source !== 'CASH') };
  assert.deepEqual(failed(tradeCase(withoutCash)), ['Cash movement']);
  const wrongCash = { ...filled, events: filled.events.map((event) =>
    event.source === 'CASH' ? { ...event, details: { amount: '-1126.60' } } : event) };
  assert.deepEqual(failed(tradeCase(wrongCash)), ['Cash matches fill']);
  const wrongShares = { ...filled, events: filled.events.map((event) =>
    event.source === 'HOLDING' ? { ...event, details: { quantityChange: 4 } } : event) };
  assert.deepEqual(failed(tradeCase(wrongShares)), ['Shares match fill']);
  const statusBehind = { ...filled, events: filled.events.filter((event) => event.type !== 'FILLED' || event.source !== 'STATUS') };
  assert.ok(failed(tradeCase(statusBehind)).includes('Status'));
  assert.deepEqual(failed(tradeCase({ ...filled, auditRecorded: false })), ['Audit trail']);
});

test('a rejection shows its reason and needs no settlement checks', () => {
  const summary = tradeCase({ orderId: ID, auditRecorded: true, events: [
    { source: 'STATUS', type: 'SUBMITTED', actor: null, occurredAt: at(1), details: {} },
    { source: 'STATUS', type: 'REJECTED', actor: null, occurredAt: at(2),
      details: { reasonCode: 'PRICE_MOVED', reasonText: 'The price rose 3.1% before your order filled.' } },
  ] });
  assert.equal(summary.status, 'REJECTED');
  assert.match(summary.reason, /price rose 3\.1%/);
  assert.deepEqual(summary.checks.map((check) => check.label), ['Audit trail', 'Final outcome']);
  assert.equal(summary.quantity, null);
  assert.equal(tradeCase({ orderId: ID, auditRecorded: false, events: [] }).status, null);
});

function page(t, trail, params = new Subject()) {
  const navigations = [];
  const instance = component(t, TradeLookupPage, [
    { provide: TRADE_TRAIL, useValue: trail },
    { provide: Router, useValue: { navigate: async (parts) => { navigations.push(parts); } } },
    { provide: ActivatedRoute, useValue: { paramMap: params } },
  ]);
  return { instance, navigations, params };
}

test('a typed order ID is checked, then opened by URL so the lookup can be bookmarked', async (t) => {
  const { instance, navigations } = page(t, { load: async () => filled });
  instance.query.set('not-an-id'); instance.submit();
  assert.match(instance.error(), /full order ID/);
  assert.deepEqual(navigations, []);
  instance.query.set(` ${ID.toUpperCase()} `); instance.submit();
  assert.deepEqual(navigations, [['/trades', ID]]);
});

test('the URL loads the trail; unknown orders and failures get fixed messages', async (t) => {
  const outcomes = { [ID]: filled, missing: Object.assign(new Error('404 body'), { status: 404 }) };
  const { instance, params } = page(t, { load: async (id) => {
    const outcome = outcomes[id === ID ? ID : 'missing'];
    if (id === '11111111-2222-3333-4444-555555555555') throw Object.assign(new Error('secret'), { status: 500 });
    if (outcome instanceof Error) throw outcome;
    return outcome;
  } });
  await instance.show(ID);
  assert.equal(instance.result(), filled);
  assert.equal(instance.summary().status, 'FILLED');
  assert.equal(instance.problems(), 0);
  await instance.show('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(instance.error(), 'No trade was found with that order ID.');
  await instance.show('11111111-2222-3333-4444-555555555555');
  assert.equal(instance.error(), 'Could not load the trade trail. Please try again.');
  await instance.show('nonsense');
  assert.equal(instance.error(), 'That is not a valid order ID.');
  params.next(convertToParamMap({}));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance.result(), null);
  assert.equal(instance.error(), '');
});

test('a slow answer for an earlier order never replaces the current one', async (t) => {
  let finishFirst;
  const { instance } = page(t, { load: (id) => id === ID
    ? new Promise((resolve) => { finishFirst = resolve; })
    : Promise.resolve({ ...filled, orderId: id }) });
  const first = instance.show(ID);
  await instance.show('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  finishFirst(filled); await first;
  assert.equal(instance.result().orderId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(instance.loading(), false);
});

test('the rendered page shows the outcome, the record checks and every step in plain words', async (t) => {
  const fixture = await render(t, TradeLookupPage, {}, [
    { provide: TRADE_TRAIL, useValue: { load: async () => filled } },
    { provide: Router, useValue: { navigate: async () => true } },
    { provide: ActivatedRoute, useValue: { paramMap: new Subject() } },
  ]);
  const host = fixture.nativeElement;
  assert.match(host.textContent, /Look up a trade/);
  input(fixture, 'input[name="orderId"]', ID);
  assert.equal(fixture.componentInstance.query(), ID);
  await fixture.componentInstance.show(ID); fixture.detectChanges();
  assert.match(host.textContent, /All consistent/);
  assert.match(host.textContent, /5 shares at \$225\.3219/);
  assert.match(host.textContent, /−\$1126\.61 USD/);
  const steps = [...host.querySelectorAll('tbody tr')].map((row) => row.children[2].textContent.trim());
  assert.deepEqual(steps, ['Submitted', 'Order accepted', 'Filled', 'Buy', 'Buy', 'Filled']);
  assert.equal(fixture.componentInstance.sourceLabel('CASH'), 'Cash movement');
  assert.deepEqual([...host.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
    ['Recorded (CT)', 'Record', 'Step', 'Details'], 'no "By" column');
  const cells = [...host.querySelectorAll('tbody tr')].map((row) =>
    [...row.children[3].querySelectorAll('span')].map((span) => span.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(cells[1], ['Status Accepted'], 'audit payloads are opened into labelled fields');
  assert.deepEqual(cells[2], ['Shares 5', 'Price $225.3219']);
  assert.deepEqual(cells[4], ['Cash −$1,126.61']);
});

test('audit payloads show labelled, formatted fields and hide internal identifiers', (t) => {
  const { instance } = page(t, { load: async () => filled });
  const decision = { source: 'AUDIT', type: 'PRICE_DECISION', actor: 'SYSTEM', occurredAt: at(2), details: {
    payload: JSON.stringify({ quoteId: 'q-1', quotedAt: '2026-10-19T14:02:05Z', bid: 225.3, ask: 225.32,
      attemptNumber: 1, referencePrice: 220, tolerancePct: 2, limitPrice: 224.4, actualPrice: 225.32 }) } };
  assert.deepEqual(instance.fields(decision).map(({ label, value }) => `${label}: ${value}`), [
    'Price offered: $225.32', 'Bid: $225.30', 'Ask: $225.32', 'Price at submission: $220.00',
    'Worst accepted: $224.40', 'Tolerance: 2%', 'Attempt: 1', 'Quote time: 09:02:05 CT',
  ]);
  const cancelled = { source: 'AUDIT', type: 'ORDER_CANCELLED', actor: 'USER', occurredAt: at(3),
    details: { payload: '{"previousStatus":"PENDING","cancelledBy":"user-uuid"}' } };
  assert.deepEqual(instance.fields(cancelled), [{ label: 'Was', value: 'Pending' }], 'the user id is never shown');
  assert.deepEqual(instance.fields({ ...cancelled, details: { payload: 'not json' } }),
    [{ label: 'Payload', value: 'not json' }]);
  assert.deepEqual(instance.fields({ ...cancelled, details: { newField: 'x' } }), [{ label: 'New field', value: 'x' }]);
});
