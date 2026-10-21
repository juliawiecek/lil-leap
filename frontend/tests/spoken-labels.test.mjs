import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { PERIOD_NAMES, chartSummary, spokenChange } = await import('../src/app/chart-speech.ts');
const { MarketTicker } = await import('../src/app/market-ticker.ts');

test('changes are said in words with two decimals, since daily moves are small', () => {
  assert.equal(spokenChange(1.254), 'up 1.25 percent');
  assert.equal(spokenChange(-0.04), 'down 0.04 percent');
  assert.equal(spokenChange(0.001), 'unchanged');
  assert.equal(spokenChange(0), 'unchanged');
});

test('period buttons have spoken names, not abbreviations', () => {
  assert.deepEqual(PERIOD_NAMES, {
    '1D': '1 day', '1W': '1 week', '1M': '1 month', '3M': '3 months', '1Y': '1 year', ALL: 'All time',
  });
});

test('a chosen period says where the portfolio started, where it is now and the change', () => {
  const base = { start: 24000, end: 25450.09, fromOpening: false, balanceHidden: false, hasHistory: true };
  assert.equal(
    chartSummary({ ...base, period: '1D' }),
    '1 day. At the start of the day you had $24,000.00. Now you have $25,450.09, up 6.04 percent.',
  );
  assert.equal(
    chartSummary({ ...base, period: '1M', end: 23500 }),
    '1 month. A month ago you had $24,000.00. Now you have $23,500.00, down 2.08 percent.',
  );
  for (const [period, start] of [['1W', 'A week ago'], ['3M', 'Three months ago'], ['1Y', 'A year ago'], ['ALL', 'When you opened your account']]) {
    assert.match(chartSummary({ ...base, period }), new RegExp(`^${PERIOD_NAMES[period]}\\. ${start} you had`));
  }
});

test('a period that starts when the money arrived says so, and hidden balances keep amounts out', () => {
  const base = { period: '1Y', start: 25000, end: 25010, hasHistory: true, balanceHidden: false };
  assert.match(chartSummary({ ...base, fromOpening: true }), /^1 year\. When you first added money you had \$25,000\.00\./);
  const hidden = chartSummary({ ...base, fromOpening: false, balanceHidden: true });
  assert.equal(hidden, '1 year. Your balance is hidden, so amounts are not read out. Your portfolio is up 0.04 percent.');
  assert.ok(!hidden.includes('$'));
  assert.equal(chartSummary({ ...base, fromOpening: false, hasHistory: false }), '1 year. There is no history for this period yet.');
  assert.match(chartSummary({ ...base, fromOpening: false, start: 0 }), /unchanged/, 'no division by zero');
});

test('each price on the tape reads with the company name, not the ticker symbol', async (t) => {
  const feed = fakeFeed([
    { symbol: 'AAPL', name: 'Apple Inc.', price: 224.52, change: 0.4 },
    { symbol: 'BA', name: 'The Boeing Company', price: 214.93, change: -1.25 },
    { symbol: 'NEW', name: 'New Listing Inc.', price: 0 },
  ]);
  const fixture = await render(t, MarketTicker, {}, [feedProvider(feed)]);
  const labels = [...fixture.nativeElement.querySelectorAll('ul:not([aria-hidden]) button')].map((b) => b.getAttribute('aria-label'));
  assert.deepEqual(labels, [
    'Apple, $224.52, up 0.40 percent',
    'Boeing, $214.93, down 1.25 percent',
    'New Listing, price not available yet',
  ]);
  feed.quotes.set(feed.quotes().map((q) => ({ ...q, quotedAt: new Date(Date.now() - 10 * 60000).toISOString() })));
  fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('ul button').getAttribute('aria-label'), /, price delayed$/);
});
