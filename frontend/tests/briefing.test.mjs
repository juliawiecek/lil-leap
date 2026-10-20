import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, browser } from './dom-helper.mjs';
const {
  biggestMover, buildBriefing, greeting, marketSentence, orderSentence, recentOrders, spokenAmount, spokenCompany,
  spokenDuration, spokenPercent,
} = await import('../src/app/briefing.ts');
const {
  BRIEFING_STORAGE_KEY, BriefingButton, BriefingService, parseBriefingSettings,
} = await import('../src/app/briefing-button.ts');

const NOW = new Date(2026, 9, 16, 14, 5);
const OPEN = { open: true, exchangeTimeZone: 'America/New_York', nextOpen: '', nextClose: new Date(NOW.getTime() + (2 * 60 + 14) * 60000).toISOString() };
const order = (over = {}) => ({
  symbol: 'AAPL', side: 'BUY', quantity: 2, status: 'FILLED', submittedAt: new Date(NOW.getTime() - 3600000).toISOString(),
  fillPrice: 182.4, filledQuantity: 2, filledAt: new Date(NOW.getTime() - 3500000).toISOString(), ...over,
});
const snapshot = (over = {}) => ({
  now: NOW, market: OPEN, balanceHidden: false, total: 24512.08, gain: 186.2, gainPercent: 0.83, buyingPower: 10000,
  holdings: [
    { symbol: 'AAPL', name: 'Apple Inc.', dayChangePercent: 1.2 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', dayChangePercent: -3.14 },
  ],
  orders: [order()], since: null, pricesDelayed: false, locale: 'en-US', ...over,
});

/** A browser storage stand-in for one test; restores whatever was there before. */
function withStorage(t, initial = {}) {
  const values = new Map(Object.entries(initial));
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  return values;
}

/** Lets the briefing's async source resolve. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A speech engine stand-in that records what it was asked to say and lets the test finish it. */
function withSpeech(t) {
  const spoken = [];
  const synth = {
    speak: (u) => spoken.push(u),
    cancel: () => { synth.cancelled += 1; },
    cancelled: 0,
  };
  class Utterance { constructor(text) { this.text = text; } }
  const before = { synth: globalThis.speechSynthesis, utterance: globalThis.SpeechSynthesisUtterance };
  globalThis.speechSynthesis = synth;
  globalThis.SpeechSynthesisUtterance = Utterance;
  t.after(() => {
    globalThis.speechSynthesis = before.synth;
    globalThis.SpeechSynthesisUtterance = before.utterance;
  });
  return { spoken, synth };
}

test('greeting follows the clock', () => {
  assert.equal(greeting(new Date(2026, 0, 1, 8)), 'Good morning');
  assert.equal(greeting(new Date(2026, 0, 1, 12)), 'Good afternoon');
  assert.equal(greeting(new Date(2026, 0, 1, 18)), 'Good evening');
});

test('amounts, percents and durations are worded the way people say them', () => {
  assert.equal(spokenAmount(24512.08), 'about $24,500');
  assert.equal(spokenAmount(10000), '$10,000');
  assert.equal(spokenAmount(186.2), '$186', 'dropping cents is not worth an "about"');
  assert.equal(spokenAmount(-1234567), 'about $1,230,000');
  assert.equal(spokenPercent(-3.14), '3.1 percent');
  assert.equal(spokenPercent(2), '2 percent');
  assert.equal(spokenDuration(30000), 'less than a minute');
  assert.equal(spokenDuration(60000), '1 minute');
  assert.equal(spokenDuration(2 * 3600000), '2 hours');
  assert.equal(spokenDuration((2 * 60 + 14) * 60000), '2 hours and 14 minutes');
});

test('company names drop legal suffixes', () => {
  assert.equal(spokenCompany('Apple Inc.', 'AAPL'), 'Apple');
  assert.equal(spokenCompany('NVIDIA Corporation', 'NVDA'), 'NVIDIA');
  assert.equal(spokenCompany('Amazon.com, Inc.', 'AMZN'), 'Amazon.com');
  assert.equal(spokenCompany('Alphabet Inc. Class A', 'GOOGL'), 'Alphabet');
  assert.equal(spokenCompany('', 'XYZ'), 'XYZ');
});

test('the market sentence says when it closes or opens', () => {
  assert.equal(marketSentence(OPEN, NOW), 'The market is open and closes in 2 hours and 14 minutes.');
  assert.equal(marketSentence(null, NOW), 'The market status is not available right now.');
  const soon = { ...OPEN, open: false, nextOpen: new Date(NOW.getTime() + 45 * 60000).toISOString() };
  assert.equal(marketSentence(soon, NOW), 'The market is closed. It opens in 45 minutes.');
  const monday = { ...OPEN, open: false, nextOpen: new Date(2026, 9, 19, 9, 30).toISOString() };
  // Newer ICU versions put a narrow no-break space before AM.
  assert.match(marketSentence(monday, NOW, 'en-US'), /^The market is closed\. It opens Monday at 9:30\sAM\.$/u);
});

test('the biggest mover is the largest move either way, ignoring unknown moves', () => {
  assert.equal(biggestMover(snapshot().holdings).symbol, 'NVDA');
  assert.equal(biggestMover([{ symbol: 'A', name: 'A', dayChangePercent: null }, { symbol: 'B', name: 'B', dayChangePercent: 0 }]), null);
});

test('only orders that finished since the last briefing are reported, newest first', () => {
  const old = order({ filledAt: new Date(NOW.getTime() - 2 * 86400000).toISOString() });
  const open = order({ status: 'ACCEPTED', filledAt: null });
  const newer = order({ symbol: 'NVDA', filledAt: new Date(NOW.getTime() - 60000).toISOString() });
  assert.deepEqual(recentOrders([old, open, order(), newer], null, NOW).map((o) => o.symbol), ['NVDA', 'AAPL']);
  assert.deepEqual(recentOrders([order(), newer], new Date(NOW.getTime() - 120000), NOW).map((o) => o.symbol), ['NVDA']);
});

test('order sentences cover fills, sells, rejections and hidden balances', () => {
  const names = new Map([['AAPL', 'Apple']]);
  assert.equal(orderSentence(order(), names, false), 'You bought 2 shares of Apple at $182.');
  assert.equal(orderSentence(order({ side: 'SELL', filledQuantity: 1 }), names, false), 'You sold 1 share of Apple at $182.');
  assert.equal(orderSentence(order(), names, true), 'You bought 2 shares of Apple.');
  assert.equal(orderSentence(order({ status: 'REJECTED', symbol: 'MSFT' }), names, false), 'Your order to buy 2 shares of MSFT was not filled.');
});

test('a full briefing reads the market, portfolio, mover, orders and buying power in order', () => {
  assert.deepEqual(buildBriefing(snapshot()), [
    'Good afternoon.',
    'The market is open and closes in 2 hours and 14 minutes.',
    'Your portfolio is worth about $24,500, up $186, or 0.8 percent, since you bought.',
    'Your biggest mover today is NVIDIA, down 3.1 percent.',
    'One order changed today.',
    'You bought 2 shares of Apple at $182.',
    'You have $10,000 in buying power.',
  ]);
});

test('hidden balances, an empty portfolio, delays and long order lists change the wording', () => {
  const hidden = buildBriefing(snapshot({ balanceHidden: true }));
  assert.ok(hidden.includes('Your balance is hidden, so amounts are not read out.'));
  assert.ok(hidden.every((line) => !/\$/.test(line)));
  const empty = buildBriefing(snapshot({ holdings: [], orders: [], buyingPower: 5000, gain: 0 }));
  assert.ok(empty.includes("You don't own any stocks yet. You have $5,000 to invest."));
  assert.ok(!empty.some((line) => /buying power/.test(line)));
  assert.ok(buildBriefing(snapshot({ pricesDelayed: true })).at(-1).startsWith('Some prices are delayed'));
  const many = Array.from({ length: 5 }, (_, i) => order({ filledAt: new Date(NOW.getTime() - (i + 1) * 60000).toISOString() }));
  const busy = buildBriefing(snapshot({ orders: many, since: new Date(NOW.getTime() - 3600000), gain: -50 }));
  assert.ok(busy.includes('5 orders changed since your last briefing.'));
  assert.ok(busy.includes('The rest are under Orders.'));
  assert.ok(busy.some((line) => /down \$50,/.test(line)));
});

test('settings fall back to defaults and are saved when changed', (t) => {
  assert.deepEqual(parseBriefingSettings(null), { rate: 1, everyMinutes: 0 });
  assert.deepEqual(parseBriefingSettings('{bad'), { rate: 1, everyMinutes: 0 });
  assert.deepEqual(parseBriefingSettings('{"rate":9,"everyMinutes":7}'), { rate: 1, everyMinutes: 0 });
  const stored = withStorage(t, { [BRIEFING_STORAGE_KEY]: '{"rate":1.25,"everyMinutes":30}' });
  const service = new BriefingService();
  assert.deepEqual(service.settings(), { rate: 1.25, everyMinutes: 30 });
  service.update({ rate: 0.8 });
  assert.deepEqual(JSON.parse(stored.get(BRIEFING_STORAGE_KEY)), { rate: 0.8, everyMinutes: 30 });
});

test('the service reads each sentence separately and tracks the one being read', (t) => {
  withStorage(t);
  const { spoken, synth } = withSpeech(t);
  const service = new BriefingService();
  service.play(['One.', 'Two.'], NOW);
  assert.deepEqual(spoken.map((u) => u.text), ['One.', 'Two.']);
  assert.equal(spoken[0].rate, 1);
  assert.equal(service.speaking(), true);
  spoken[1].onstart();
  assert.equal(service.current(), 1);
  spoken[1].onend();
  assert.equal(service.speaking(), false);
  assert.equal(service.current(), -1);
  assert.equal(service.lastAt, NOW);
  service.stop();
  assert.ok(synth.cancelled >= 1);
});

test('without a speech engine the briefing is still shown as text', (t) => {
  withStorage(t);
  const before = globalThis.speechSynthesis;
  globalThis.speechSynthesis = undefined;
  t.after(() => { globalThis.speechSynthesis = before; });
  const service = new BriefingService();
  service.play(['Only text.']);
  assert.deepEqual(service.lines(), ['Only text.']);
  assert.equal(service.speaking(), false);
});

test('the button plays a briefing, shows the transcript and answers Alt+B', async (t) => {
  withStorage(t);
  const { spoken } = withSpeech(t);
  let calls = 0;
  const source = async () => { calls += 1; return snapshot(); };
  const fixture = await render(t, BriefingButton, { source });
  const root = fixture.nativeElement;
  root.querySelector('.briefing-button').click();
  await settle(); fixture.detectChanges();
  assert.equal(calls, 1);
  assert.equal(spoken.length, 7);
  assert.equal(root.querySelectorAll('li').length, 7);
  assert.equal(root.querySelector('.briefing-button').getAttribute('aria-expanded'), 'true');
  spoken[2].onstart(); fixture.detectChanges();
  assert.match(root.querySelector('li.current').textContent, /portfolio is worth/);

  browser.document.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'b', altKey: true, bubbles: true }));
  await settle(); fixture.detectChanges();
  assert.equal(calls, 2);
  // The second briefing only reports orders since the first one, so the old fill is not repeated.
  assert.ok(!fixture.componentInstance.service.lines().some((line) => /You bought/.test(line)));

  root.querySelector('[aria-label="Close briefing"]').click(); fixture.detectChanges();
  assert.equal(root.querySelector('.briefing-panel'), null);
});

test('a failed source shows an error, and the repeat timer only plays when one is due', async (t) => {
  withStorage(t, { [BRIEFING_STORAGE_KEY]: '{"rate":1,"everyMinutes":15}' });
  withSpeech(t);
  let fail = true;
  const source = async () => { if (fail) throw new Error('down'); return snapshot(); };
  const fixture = await render(t, BriefingButton, { source });
  const button = fixture.componentInstance;
  await button.play(); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('[role="alert"]').textContent, /could not be prepared/);

  fail = false;
  const plays = t.mock.method(button, 'play');
  button.service.lastAt = null;
  button.tick();
  assert.equal(plays.mock.callCount(), 0, 'no briefing yet, so nothing to repeat');
  button.service.lastAt = new Date(Date.now() - 10 * 60000);
  button.tick();
  assert.equal(plays.mock.callCount(), 0, 'not due yet');
  button.tick(Date.now() + 6 * 60000);
  assert.equal(plays.mock.callCount(), 1);
});

test('a market open or close triggers a briefing only when repeats are on', async (t) => {
  withStorage(t, { [BRIEFING_STORAGE_KEY]: '{"rate":1,"everyMinutes":30}' });
  withSpeech(t);
  const fixture = await render(t, BriefingButton, { source: async () => snapshot(), marketOpen: false });
  const plays = t.mock.method(fixture.componentInstance, 'play', async () => {});
  fixture.componentRef.setInput('marketOpen', true); fixture.detectChanges();
  assert.equal(plays.mock.callCount(), 1);
  fixture.componentInstance.service.update({ everyMinutes: 0 });
  fixture.componentRef.setInput('marketOpen', false); fixture.detectChanges();
  assert.equal(plays.mock.callCount(), 1);
});
