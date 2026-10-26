import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { PERIOD_NAMES, chartSummary, spokenChange } = await import('../src/app/chart-speech.ts');
const { MarketTicker } = await import('../src/app/market-ticker.ts');
const { STOCK_NAMES, speakable, spokenQuote, stockName, voiceText } = await import('../src/app/speech-text.ts');
const { speechTime, spokenItem } = await import('../../shared/switch-scan.ts');
const { orderReadBack } = await import('../src/app/order-read-back.ts');

test('an order is read back with side, shares, company, total and how to place it', () => {
  const base = { symbol: 'GOOGL', name: 'Alphabet Inc.', closedWarning: '', priceDelayed: false };
  assert.equal(
    orderReadBack({ ...base, side: 'Buy', quantity: 2, total: 374.2 }),
    "You're about to buy 2 shares of Google for $374. Press Confirm buy to place the order.",
  );
  assert.equal(
    orderReadBack({ ...base, side: 'Sell', quantity: 1, total: 24512.08 }),
    "You're about to sell 1 share of Google for about $24,500. Press Confirm sell to place the order.",
  );
});

test('the read-back mentions a closed market and a delayed price when the review shows them', () => {
  const text = orderReadBack({
    side: 'Buy', quantity: 3, symbol: 'ZZZ', name: 'Acme Widgets, Inc.', total: 90,
    closedWarning: 'The market is closed. Your order will fill when it opens at 8:30 AM.', priceDelayed: true,
  });
  assert.equal(text, "You're about to buy 3 shares of Acme Widgets for $90. The market is closed. Your order will fill "
    + 'when it opens at 8:30 AM. The price is delayed, so the final total may be different. Press Confirm buy to place the order.');
});

test('all 33 listed stocks have spoken names, so no symbol is ever spelled out', () => {
  assert.equal(Object.keys(STOCK_NAMES).length, 33);
  assert.equal(stockName('googl'), 'Google');
  assert.equal(stockName('AMZN'), 'Amazon');
  assert.equal(stockName('ZZZZ'), null);
});

test('symbols, arrows and bullets are not read literally', () => {
  assert.equal(speakable('Sign out ↗'), 'Sign out');
  assert.equal(speakable('Novice demo account ••B3B9$24,550.68 available'), 'Novice demo account, ending in B3B9, $24,550.68 available');
  assert.equal(speakable('AMZN'), 'Amazon');
  assert.equal(speakable('Buy 2 GOOGL · about $450.09 · fills at up to $459.09'), 'Buy 2 Google, about $450.09, fills at up to $459.09');
  assert.equal(speakable('BAC and BA'), 'Bank of America and Boeing', 'longer symbols are not cut short');
  assert.equal(speakable('★ Saved'), 'Saved');
  assert.equal(speakable('◀ Back'), 'Back');
  assert.equal(speakable('Price protection 2%'), 'Price protection 2%');
  assert.equal(speakable('Loading…'), 'Loading');
  assert.equal(speakable('Open · Closes 3:00 PM CT'), 'Open, Closes 3:00 PM CT', 'other capitals are left alone');
});

test('a hidden balance is said as hidden, never as the end of an account number', () => {
  assert.equal(speakable('Total portfolio value ••••••••'), 'Total portfolio value hidden');
  assert.equal(speakable('3 positions · •••••• invested'), '3 positions, hidden invested');
  assert.equal(speakable('account ••B3B9'), 'account, ending in B3B9', 'an account ending is unchanged');
});

test('voice mode says $, %, + and marks such as ★ and × as words or leaves them out (PS-22)', () => {
  assert.equal(voiceText('AAPL +1.20%'), 'Apple up 1.20 percent');
  assert.equal(voiceText('Today −$4.10 (−0.52%)'), 'Today down 4 dollars and 10 cents (down 0.52 percent)');
  assert.equal(voiceText('Buying power $24,550.68'), 'Buying power 24,550 dollars and 68 cents');
  assert.equal(voiceText('Total $185.00'), 'Total 185 dollars');
  assert.equal(voiceText('Price protection 2%'), 'Price protection 2 percent');
  assert.equal(voiceText('★ Saved'), 'Saved');
  assert.equal(voiceText('Close ×'), 'Close');
  assert.equal(voiceText('+ Add account'), 'Add account');
  assert.equal(voiceText('Level +2'), 'Level plus 2');
  assert.equal(voiceText('Pay-as-you-go 3-5 days'), 'Pay-as-you-go 3-5 days', 'hyphens inside words and ranges stay');
  for (const text of ['AAPL $224.52 +0.40%', 'Buy 2 GOOGL · about $450.09', '★ Saved × Close + more %']) {
    assert.doesNotMatch(voiceText(text), /[$%+★×]/, text);
  }
});

test('a stock in a list is said as its name, rounded price and change, then what selecting does', () => {
  assert.equal(spokenQuote('Apple', 185.2, 1.23), 'Apple, 185 dollars, up 1.2 percent. Select to trade.');
  assert.equal(spokenQuote('Broadcom', 1234.56, -0.04), 'Broadcom, 1,235 dollars, unchanged. Select to trade.');
  assert.equal(spokenQuote('Penny', 4.567, -2), 'Penny, 4.57 dollars, down 2.0 percent. Select to trade.');
  assert.equal(spokenQuote('Apple', 185, 1, true), 'Apple, 185 dollars, up 1.0 percent, price delayed. Select to trade.');
  assert.equal(spokenQuote('New Listing', 0, 0), 'New Listing, price not available yet.');
});

test('if the speech engine never says it finished, the ring still moves on, later for longer sentences', () => {
  const short = speechTime('Buy');
  const summary = speechTime('1 month. When you first added money you had $25,000.00. Now you have $25,000.63, unchanged.');
  assert.ok(short >= 4000 && short < 5000, `a word: about 4 s at most (${short} ms)`);
  assert.ok(summary > 15000, `a chart summary is never cut at 5 seconds (${summary} ms)`);
  assert.equal(speechTime('x'.repeat(5000)), 30000, 'never held longer than 30 s');
});

test('changes are said in words with two decimals, since daily moves are small', () => {
  assert.equal(spokenChange(1.254), 'up 1.25 percent');
  assert.equal(spokenChange(-0.04), 'down 0.04 percent');
  assert.equal(spokenChange(0.001), 'unchanged');
  assert.equal(spokenChange(0), 'unchanged');
});

test('period buttons have spoken names, not abbreviations', () => {
  assert.deepEqual(PERIOD_NAMES, {
    '1D': 'Today, Central time', '1W': 'Last 7 days', '1M': 'Last 30 days', '3M': 'Last 90 days', '1Y': 'Last 365 days', ALL: 'All available recorded history',
  });
});

test('a chosen period says where the portfolio started, where it is now and the change', () => {
  const base = { start: 24000, end: 25450.09, fromOpening: false, balanceHidden: false, hasHistory: true };
  assert.equal(
    chartSummary({ ...base, period: '1D' }),
    'Today, Central time. At the start of the day you had $24,000.00. Now you have $25,450.09, up 6.04 percent. Account value includes deposits and transfers.',
  );
  assert.equal(
    chartSummary({ ...base, period: '1M', end: 23500 }),
    'Last 30 days. 30 days ago you had $24,000.00. Now you have $23,500.00, down 2.08 percent. Account value includes deposits and transfers.',
  );
  for (const [period, start] of [['1W', 'A week ago'], ['3M', '90 days ago'], ['1Y', '365 days ago'], ['ALL', 'At the first recorded value']]) {
    assert.match(chartSummary({ ...base, period }), new RegExp(`^${PERIOD_NAMES[period]}\\. ${start} you had`));
  }
});

test('a period that starts when the money arrived says so, and hidden balances keep amounts out', () => {
  const base = { period: '1Y', start: 25000, end: 25010, hasHistory: true, balanceHidden: false };
  assert.match(chartSummary({ ...base, fromOpening: true }), /^Last 365 days\. At the first available recorded value you had \$25,000\.00\./);
  const hidden = chartSummary({ ...base, fromOpening: false, balanceHidden: true });
  assert.equal(hidden, 'Last 365 days. Your balance is hidden, so amounts are not read out. Your portfolio is up 0.04 percent.');
  assert.ok(!hidden.includes('$'));
  assert.equal(chartSummary({ ...base, fromOpening: false, hasHistory: false }), 'Last 365 days. There is no history for this period yet.');
  assert.match(chartSummary({ ...base, fromOpening: false, start: 0 }), /percentage change unavailable/, 'no invented zero-percent change');
});

test('partial history never claims its first value was recorded a year ago', () => {
  const text = chartSummary({ period: '1Y', start: 100, end: 110, hasHistory: true,
    balanceHidden: false, fromOpening: false, partial: true });
  assert.match(text, /first available recorded value/);
  assert.match(text, /Earlier history.*unavailable/);
  assert.match(text, /Account value includes deposits and transfers/);
  assert.doesNotMatch(text, /365 days ago you had/);
  const hidden = chartSummary({ period: '1Y', start: 100, end: 110, hasHistory: true,
    balanceHidden: true, fromOpening: false, partial: true });
  assert.match(hidden, /Only part of the requested period/);
  assert.doesNotMatch(hidden, /\$/);
});

test('each price on the tape is named by what it shows, and switch control says the company name', async (t) => {
  const feed = fakeFeed([
    { symbol: 'AAPL', name: 'Apple Inc.', price: 224.52, change: 0.4 },
    { symbol: 'BA', name: 'The Boeing Company', price: 214.93, change: -1.25 },
    { symbol: 'KO', name: 'Coca-Cola', price: 61.2, change: 0 },
    { symbol: 'NEW', name: 'New Listing Inc.', price: 0 },
  ]);
  const fixture = await render(t, MarketTicker, {}, [feedProvider(feed)]);
  const buttons = [...fixture.nativeElement.querySelectorAll('ul:not([aria-hidden]) button')];
  const labels = buttons.map((b) => b.getAttribute('aria-label'));
  // WCAG 2.5.3 (PS-20): the name holds the visible text, in order, so speech input can match it.
  assert.deepEqual(labels, ['AAPL, $224.52, +0.40%', 'BA, $214.93, −1.25%', 'KO, $61.20, 0.00%', 'NEW, price not available yet']);
  const bare = (text) => text.replace(/[^\p{L}\p{N}−]+/gu, ' ').trim();
  buttons.slice(0, 3).forEach((button, i) => {
    const shown = [...button.querySelectorAll('strong, .price, .change [aria-hidden="true"]')].map((el) => el.textContent).join(' ');
    assert.equal(bare(labels[i]), bare(shown));
  });
  // Voice mode and switch control read data-speak: company names, rounded prices and the move in
  // words, then what selecting does (PS-22).
  assert.deepEqual(buttons.map((b) => b.getAttribute('data-speak')), [
    'Apple, 225 dollars, up 0.4 percent. Select to trade.',
    'Boeing, 215 dollars, down 1.3 percent. Select to trade.',
    'Coca-Cola, 61 dollars, unchanged. Select to trade.',
    'New Listing, price not available yet.',
  ]);
  assert.equal(spokenItem(buttons[0]), 'Apple, 225 dollars, up 0.4 percent. Select to trade.');
  feed.quotes.set(feed.quotes().map((q) => ({ ...q, quotedAt: new Date(Date.now() - 10 * 60000).toISOString() })));
  fixture.detectChanges();
  const first = fixture.nativeElement.querySelector('ul button');
  assert.match(first.getAttribute('aria-label'), /, Price delayed$/);
  assert.match(first.getAttribute('data-speak'), /, price delayed\. Select to trade\.$/);
});
