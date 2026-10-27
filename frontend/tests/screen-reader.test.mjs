import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, browser } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { LiveAnnouncer, ANNOUNCE_DELAY_MS, liveAnnouncer } = await import('../src/app/live-announcer.ts');
const { orderAnnouncement, OrderAnnouncements } = await import('../src/app/order-announcements.ts');
const {
  LivePricesService, PriceWatcher, PRICE_WATCH_INTERVAL_MS, parseLivePrices, priceMoveText, priceWatchMessage,
} = await import('../src/app/live-prices.ts');
const { PriceWatch } = await import('../src/app/price-watch.ts');
const { LivePricesSettingsCard } = await import('../src/app/live-prices-settings.ts');
const { MarketTicker } = await import('../src/app/market-ticker.ts');
const { MarketFeed } = await import('../src/app/market-feed.service.ts');
const { QUOTE_REFRESH_MS } = await import('../src/app/portfolio-api.ts');
const { NoviceDashboard } = await import('../src/app/novice-dashboard.ts');
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');
const { StockDashboardComponent } = await import('../src/app/stock-dashboard.component.ts');
const { BriefingService, BriefingButton } = await import('../src/app/briefing-button.ts');
const { ACCESSIBILITY_STORAGE_KEY } = await import('../src/app/accessibility.ts');

/** PS-21: screen readers hear trades, live prices and tables clearly. */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };

/** Browser storage holding these Accessibility settings sections; returns the live entry. */
function withStorage(t, sections = {}) {
  const values = new Map([[ACCESSIBILITY_STORAGE_KEY, JSON.stringify(sections)]]);
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => (previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage));
  return () => JSON.parse(values.get(ACCESSIBILITY_STORAGE_KEY));
}

/** An announcer stand-in that records what it was asked to say. */
const recorder = () => {
  const said = [];
  return { said, announce: (text, politeness = 'polite') => said.push([text, politeness]) };
};

// ---- The live announcer -------------------------------------------------------------------

test('the announcer keeps a polite and an assertive region on the page from the start, empty until it speaks', async () => {
  const announcer = new LiveAnnouncer();
  const regions = () => [...browser.document.querySelectorAll('[data-announcer]')].slice(-2);
  assert.deepEqual(regions().map((r) => [r.getAttribute('aria-live'), r.getAttribute('aria-atomic'), r.className, r.textContent]),
    [['polite', 'true', 'sr-only', ''], ['assertive', 'true', 'sr-only', '']]);
  announcer.announce('Order sent: buy 2 shares of Apple.');
  assert.equal(regions()[0].textContent, '', 'emptied first, so the same words twice are still read');
  await sleep(ANNOUNCE_DELAY_MS + 20);
  assert.equal(regions()[0].textContent, 'Order sent: buy 2 shares of Apple.');
  announcer.announce('Rejected: no cash.', 'assertive');
  announcer.announce('   ');
  await sleep(ANNOUNCE_DELAY_MS + 20);
  assert.equal(regions()[1].textContent, 'Rejected: no cash.');
  assert.deepEqual(announcer.history.map((h) => h.politeness), ['polite', 'assertive'], 'blank messages are ignored');
  assert.deepEqual(regions().map((r) => r.textContent), ['Order sent: buy 2 shares of Apple.', 'Rejected: no cash.'], 'each politeness keeps its own region');
  announcer.announce('Order sent: buy 1 share of Apple.');
  announcer.announce('Filled: bought 1 share of Apple at $225.02.');
  await sleep(ANNOUNCE_DELAY_MS + 20);
  assert.equal(regions()[0].textContent, 'Order sent: buy 1 share of Apple. Filled: bought 1 share of Apple at $225.02.',
    'a message arriving before the last one was placed joins it, in order, instead of replacing it');
  regions()[0].remove();
  announcer.announce('Again.');
  await sleep(ANNOUNCE_DELAY_MS + 20);
  assert.equal(regions().at(-1).textContent, 'Again.', 'a region removed from the page is put back');
  assert.ok(liveAnnouncer() instanceof LiveAnnouncer, 'outside Angular a service still gets an announcer');
});

test('while a modal dialog is open the announcer speaks from inside it, and moves back out once it closes', async () => {
  const announcer = new LiveAnnouncer();
  const polite = () => [...browser.document.querySelectorAll('[data-announcer="polite"]')].at(-1);
  const dialog = browser.document.createElement('dialog');
  browser.document.body.append(dialog);
  // Chrome hides everything outside a modal dialog from screen readers (happy-dom has no :modal).
  dialog.matches = (selector) => selector === ':modal' && dialog.open;
  dialog.showModal();
  dialog.setAttribute('open', '');
  announcer.announce('Buy 1 Apple, about $100.00.');
  assert.equal(polite().parentElement, dialog);
  await sleep(ANNOUNCE_DELAY_MS + 20);
  assert.equal(dialog.querySelector('[data-announcer]').textContent, 'Buy 1 Apple, about $100.00.');
  dialog.close();
  dialog.removeAttribute('open');
  announcer.announce('Order accepted.');
  assert.equal(polite().parentElement, browser.document.body);
  const legacy = browser.document.createElement('dialog');
  legacy.setAttribute('open', ''); legacy.setAttribute('aria-modal', 'true');
  legacy.matches = () => { throw new SyntaxError(':modal'); };
  browser.document.body.append(legacy);
  announcer.announce('Filled.', 'assertive');
  assert.equal([...browser.document.querySelectorAll('[data-announcer="assertive"]')].at(-1).parentElement, legacy, 'aria-modal stands in where :modal is unknown');
  dialog.remove(); legacy.remove();
});

test('without a page the announcer still records what it would have said', () => {
  const doc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });
  try {
    const announcer = new LiveAnnouncer();
    announcer.announce('Filled.');
    assert.deepEqual(announcer.history, [{ text: 'Filled.', politeness: 'polite' }]);
  } finally {
    Object.defineProperty(globalThis, 'document', doc);
  }
});

// ---- Order announcements ------------------------------------------------------------------

test('each order step has its own words: sent, accepted and filled wait their turn, a rejection cuts in', () => {
  const buy = { side: 'BUY', quantity: 2, symbol: 'AAPL' };
  assert.deepEqual(orderAnnouncement('sent', buy), { text: 'Order sent: buy 2 shares of Apple.', politeness: 'polite' });
  assert.deepEqual(orderAnnouncement('accepted', { ...buy, side: 'Sell', quantity: 1 }),
    { text: 'Order accepted: sell 1 share of Apple. Waiting for it to fill.', politeness: 'polite' });
  assert.deepEqual(orderAnnouncement('filled', { ...buy, fillPrice: 225.1 }), { text: 'Filled: bought 2 shares of Apple at $225.10.', politeness: 'polite' });
  assert.equal(orderAnnouncement('filled', { ...buy, side: 'SELL', symbol: 'ZZZ', fillPrice: null }).text, 'Filled: sold 2 shares of ZZZ.');
  assert.deepEqual(orderAnnouncement('rejected', { ...buy, reason: 'There was not enough cash.' }),
    { text: 'Rejected: your order to buy 2 shares of Apple was not filled. There was not enough cash.', politeness: 'assertive' });
  assert.equal(orderAnnouncement('rejected', buy).text, 'Rejected: your order to buy 2 shares of Apple was not filled.');
});

test('each step of each order is said once, however often its status is re-read', () => {
  const announcer = recorder();
  const news = new OrderAnnouncements(announcer);
  const order = { side: 'BUY', quantity: 1, symbol: 'MSFT' };
  assert.equal(news.say('o1', 'accepted', order), true);
  assert.equal(news.say('o1', 'accepted', order), false);
  news.say('o2', 'accepted', order);
  news.say('o1', 'filled', order);
  assert.deepEqual(announcer.said.map(([text]) => text.split(':')[0]), ['Order accepted', 'Order accepted', 'Filled']);
});

// ---- Live price settings and Price watch ---------------------------------------------------

test('live price settings start off, ignore anything invalid, and are remembered in the livePrices section', (t) => {
  assert.deepEqual(parseLivePrices(undefined), { paused: false, watch: { enabled: false, symbols: [], threshold: 1 } });
  assert.deepEqual(parseLivePrices({ paused: 'yes', watch: { enabled: 1, symbols: ['AAPL', 'AAPL', 'bad sym', 7], threshold: 3 } }),
    { paused: false, watch: { enabled: false, symbols: ['AAPL'], threshold: 1 } });
  assert.deepEqual(parseLivePrices({ watch: 'x' }).watch.symbols, []);
  const saved = withStorage(t, { livePrices: { paused: true, watch: { enabled: true, symbols: ['MSFT'], threshold: 0.5 } } });
  const live = new LivePricesService();
  assert.equal(live.paused(), true);
  live.setPaused(false);
  live.toggleWatched('AAPL');
  live.toggleWatched('MSFT');
  live.updateWatch({ threshold: 2 });
  assert.deepEqual(saved().livePrices, { paused: false, watch: { enabled: true, symbols: ['AAPL'], threshold: 2 } });
  assert.deepEqual(new LivePricesService().settings(), saved().livePrices, 'a reload reads the same settings');
});

test('price moves are said with company names, up or down, in one message', () => {
  assert.equal(priceMoveText('AAPL', 1.26), 'Apple up 1.3 percent');
  assert.equal(priceMoveText('MSFT', -3.04), 'Microsoft down 3 percent');
  assert.equal(priceMoveText('ZZZ', 0.5), 'ZZZ up 0.5 percent');
  assert.equal(priceWatchMessage([{ symbol: 'AAPL', move: 1.3 }]), 'Price alert: Apple up 1.3 percent.');
  assert.equal(priceWatchMessage([{ symbol: 'AAPL', move: 1.3 }, { symbol: 'MSFT', move: -1.1 }]),
    '2 alerts: Apple up 1.3 percent, Microsoft down 1.1 percent.');
});

test('Price watch groups moves past the threshold and speaks at most once every 10 seconds', () => {
  const watch = { enabled: true, symbols: ['AAPL', 'MSFT'], threshold: 1 };
  const w = new PriceWatcher();
  const at = (s) => s * 1000;
  assert.equal(w.update([{ symbol: 'AAPL', price: 100 }, { symbol: 'MSFT', price: 200 }, { symbol: 'NVDA', price: 50 }], watch, at(0)), null, 'first prices are the baseline');
  assert.equal(w.update([{ symbol: 'AAPL', price: 100.5 }, { symbol: 'MSFT', price: 200 }, { symbol: 'NVDA', price: 99 }], watch, at(5)), null, 'below the threshold; NVDA is not watched');
  assert.equal(w.update([{ symbol: 'AAPL', price: 101.3 }, { symbol: 'MSFT', price: 197.8 }], watch, at(10)), '2 alerts: Apple up 1.3 percent, Microsoft down 1.1 percent.');
  assert.equal(w.update([{ symbol: 'AAPL', price: 103 }, { symbol: 'MSFT', price: 197.8 }], watch, at(15)), null, 'moved again, but only 5 seconds later');
  assert.equal(w.update([{ symbol: 'AAPL', price: 103 }, { symbol: 'MSFT', price: 197.8 }], watch, at(10) + PRICE_WATCH_INTERVAL_MS), 'Price alert: Apple up 1.7 percent.', 'measured from the price last announced');
  // A move that falls back inside the threshold before its turn is not news any more.
  w.update([{ symbol: 'MSFT', price: 200 }], watch, at(21));
  assert.equal(w.update([{ symbol: 'MSFT', price: 197.8 }], watch, at(40)), null);
  // Unwatching forgets a stock; turning watch off forgets everything.
  assert.equal(w.update([{ symbol: 'MSFT', price: 150 }], { ...watch, symbols: ['AAPL'] }, at(60)), null);
  assert.equal(w.update([{ symbol: 'AAPL', price: 50 }], { ...watch, enabled: false }, at(80)), null);
  assert.equal(w.update([{ symbol: 'AAPL', price: 50 }, { symbol: 'AAPL', price: 0 }], watch, at(100)), null, 'a fresh baseline; a missing price is skipped');
});

test('the Price watch region speaks only for picked stocks, after each price refresh', async (t) => {
  withStorage(t, { livePrices: { watch: { enabled: true, symbols: ['AAPL'], threshold: 1 } } });
  const feed = fakeFeed([{ symbol: 'AAPL', price: 100 }, { symbol: 'MSFT', price: 100 }]);
  const fixture = await render(t, PriceWatch, {}, [feedProvider(feed)]);
  const region = fixture.nativeElement.querySelector('[data-price-watch]');
  assert.deepEqual([region.getAttribute('aria-live'), region.getAttribute('aria-atomic')], ['polite', 'true']);
  feed.push([{ symbol: 'AAPL', price: 100 }, { symbol: 'MSFT', price: 100 }]);
  feed.push([{ symbol: 'AAPL', price: 102 }, { symbol: 'MSFT', price: 120 }]);
  await sleep(ANNOUNCE_DELAY_MS + 20); fixture.detectChanges();
  assert.equal(region.textContent, 'Price alert: Apple up 2 percent.');
  fixture.componentInstance.check(Date.now() + PRICE_WATCH_INTERVAL_MS);
  assert.equal(fixture.componentInstance.message(), 'Price alert: Apple up 2 percent.', 'nothing new to say, so the region is left alone');
});

test('the Live prices card pauses updates, turns Price watch on and picks stocks and a threshold', async (t) => {
  const saved = withStorage(t);
  const fixture = await render(t, LivePricesSettingsCard, {}, [{ provide: LivePricesService, useFactory: () => new LivePricesService() }]);
  const root = fixture.nativeElement;
  const box = (text) => [...root.querySelectorAll('label.check')].find((l) => l.textContent.includes(text)).querySelector('input');
  box('Pause live updates').click();
  box('Tell my screen reader').click();
  box('AAPL').click(); box('NVDA').click();
  const threshold = root.querySelector('select');
  threshold.value = '0.5'; threshold.dispatchEvent(new browser.Event('change'));
  fixture.detectChanges();
  assert.deepEqual(saved().livePrices, { paused: true, watch: { enabled: true, symbols: ['AAPL', 'NVDA'], threshold: 0.5 } });
  assert.match(root.querySelector('.stocks legend').textContent, /2 chosen/);
  assert.match(root.textContent, /AAPL Apple/);
  assert.doesNotMatch(root.textContent, /A M D/, 'a name written only for speech is not shown');
  assert.equal(root.querySelector('details.more > summary').textContent.trim(), 'Price watch', 'Price watch sits behind a caret');
});

// ---- Pause live updates ---------------------------------------------------------------------

/** A real feed over a scripted market whose price rises by 1 on every request. */
function scriptedFeed(t, live) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } });
  t.after(() => Object.defineProperty(globalThis, 'document', original));
  const feed = component(t, MarketFeed, [{ provide: LivePricesService, useValue: live }]);
  let price = 100;
  const calls = { latest: 0 };
  feed.client = {
    signedIn: true,
    instruments: async () => [{ instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple', sector: 'TECH' }],
    dayOpens: async () => new Map([['aapl', 100]]),
    latestMany: async () => { calls.latest += 1; return new Map([['aapl', { price: price++, bid: 0, ask: 0, quotedAt: new Date().toISOString() }]]); },
  };
  feed.statusClient = { status: async () => null };
  return { feed, calls };
}

test('paused, the feed shows the first prices and then stops refreshing until resumed (WCAG 2.2.2)', async (t) => {
  withStorage(t, { livePrices: { paused: true } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const live = new LivePricesService();
  const { feed, calls } = scriptedFeed(t, live);
  assert.equal(feed.paused, true);
  const stop = feed.start();
  await flush();
  assert.equal(feed.quote('AAPL').price, 100, 'something to show even when paused');
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(QUOTE_REFRESH_MS); await flush(); }
  assert.equal(calls.latest, 1, 'no refresh while paused');
  assert.equal(feed.quote('AAPL').price, 100);
  live.setPaused(false);
  t.mock.timers.tick(QUOTE_REFRESH_MS); await flush();
  assert.equal(feed.quote('AAPL').price, 101, 'the next refresh after resuming moves again');
  stop();
});

test('the ticker is not a live region, has no pause button, and stops scrolling when paused in Settings', async (t) => {
  withStorage(t);
  const feed = fakeFeed([{ symbol: 'AAPL', name: 'Apple Inc.', price: 100 }]);
  const live = new LivePricesService();
  const fixture = await render(t, MarketTicker, {}, [feedProvider(feed), { provide: LivePricesService, useValue: live }]);
  const root = fixture.nativeElement;
  const ticker = root.querySelector('.ticker');
  assert.deepEqual([ticker.getAttribute('role'), ticker.getAttribute('aria-label'), ticker.getAttribute('aria-live')], ['region', 'Live prices', 'off']);
  assert.equal(root.querySelector('[role=status], [role=alert], [aria-live=polite], [aria-live=assertive]'), null, 'nothing in the ticker is read out on its own');
  assert.ok(ticker.hasAttribute('data-a11y-no-hover'), 'voice mode does not read the tape on hover');
  assert.equal([...root.querySelectorAll('button')].some((b) => /pause/i.test(b.textContent)), false);
  assert.ok(root.querySelector('.tape').classList.contains('moving'));
  live.setPaused(true); fixture.detectChanges();
  assert.equal(root.querySelector('.tape').classList.contains('moving'), false);
});

// ---- Novice trading -------------------------------------------------------------------------

async function noviceTicket(t) {
  withStorage(t);
  t.mock.method(NoviceDashboard.prototype, 'ngOnInit', () => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const feed = fakeFeed([{ symbol: 'AAPL', name: 'Apple Inc.', price: 100 }, { symbol: 'MSFT', name: 'Microsoft', price: 50 }]);
  const fixture = await render(t, NoviceDashboard, {}, [feedProvider(feed)]);
  const desk = fixture.componentInstance;
  desk.applyPortfolio({ cash: 150, holdings: [{ symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 2, averageCost: 90 }] });
  desk.openTrade('Buy', 'AAPL');
  fixture.detectChanges();
  return { fixture, desk, root: fixture.nativeElement };
}

test('a novice share count that cannot be traded is marked invalid, linked to its error, and focused', async (t) => {
  const { fixture, desk, root } = await noviceTicket(t);
  assert.equal(root.querySelector('.detail-dialog form').hasAttribute('novalidate'), true, 'our own messages, not browser bubbles');
  desk.quantity.set('5'); desk.reviewTrade(); fixture.detectChanges();
  const field = root.querySelector('#novice-shares');
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.equal(field.getAttribute('aria-describedby'), 'novice-shares-error');
  assert.match(root.querySelector('#novice-shares-error').textContent, /exceeds your buying power/);
  assert.equal(root.querySelector('.detail-dialog output').textContent.trim(), '', 'said once, by the field');
  t.mock.timers.tick(1);
  assert.equal(browser.document.activeElement, field);
  desk.quantity.set('1'); desk.tradeMessage.set(''); fixture.detectChanges();
  assert.equal(field.getAttribute('aria-invalid'), null, 'cleared as soon as the count changes');
  assert.equal(root.querySelector('#novice-shares-error'), null);
});

test('reviewing a novice order announces the review once and moves focus to Confirm', async (t) => {
  const { fixture, desk, root } = await noviceTicket(t);
  desk.quantity.set('1'); desk.reviewTrade(); fixture.detectChanges();
  const confirm = root.querySelector('#novice-confirm');
  assert.match(confirm.textContent, /Confirm buy/);
  const summary = root.querySelector('#novice-review-summary').textContent.trim();
  assert.match(summary, /^Buy 1 AAPL · about \$100\.00/);
  assert.deepEqual(desk.announcer.history.at(-1), { text: 'Buy 1 Apple, about $100.00, fills at up to $102.00', politeness: 'polite' }, 'said with the company name');
  assert.equal(root.querySelector('#novice-review-summary').getAttribute('role'), null, 'not also a live region, so it is read once');
  assert.equal(confirm.getAttribute('aria-describedby'), null, 'nor repeated as the button description');
  await fixture.whenStable();
  assert.equal(browser.document.activeElement, confirm);
  assert.equal(root.querySelector('.detail-dialog output').getAttribute('aria-live'), 'off');
  const said = desk.announcer.history.length;
  desk.reviewTrade();
  assert.equal(desk.announcer.history.length, said, 'pressing Confirm re-checks the order without reading it again');
});

test('the novice tables have captions and column headers with scope, and row buttons name their stock', async (t) => {
  const { fixture, desk, root } = await noviceTicket(t);
  desk.closeModal(); fixture.detectChanges();
  const tables = [...root.querySelectorAll('table')];
  assert.ok(tables.length >= 2);
  for (const table of tables) {
    assert.ok(table.querySelector('caption')?.textContent.trim(), 'every table has a caption');
    for (const th of table.querySelectorAll('th')) assert.equal(th.getAttribute('scope'), 'col');
  }
  const trade = root.querySelector('.holding-actions');
  assert.equal(trade.getAttribute('aria-label'), 'Trade AAPL');
  assert.ok(trade.getAttribute('aria-label').includes(trade.textContent.trim()), 'the name contains the visible word (WCAG 2.5.3)');
  assert.match(root.querySelector('.holdings-table app-financial-change .sr-only').textContent, /^(up|down|unchanged)/);
  assert.equal(root.querySelector('.market-status [role=status]'), null, 'the market countdown is not read out every minute');
  assert.ok(root.querySelector('main [data-price-watch]'), 'Price watch has its region on the page');
});

test('the activity list is not a live region, so a refresh does not read every row again', async () => {
  const { readFileSync } = await import('node:fs');
  const template = readFileSync(new URL('../src/app/activity-feed.html', import.meta.url), 'utf8');
  const list = template.match(/<ol class="activity-list"[^>]*>/)[0];
  assert.doesNotMatch(list, /aria-live="(polite|assertive)"|role="(status|log|alert)"/);
  assert.match(list, /\[attr\.aria-busy\]="loading\(\)/, 'busy while a refresh is loading');
});

test('table changes are read as "up 1.2 percent" or "down 3 percent" and shown with ▲ or ▼', async () => {
  const { describeChange } = await import('../src/app/financial-change.ts');
  assert.deepEqual(describeChange(1.2), { visual: '▲ +1.20%', spoken: 'up 1.2 percent', direction: 'up' });
  assert.deepEqual(describeChange(-3), { visual: '▼ −3.00%', spoken: 'down 3 percent', direction: 'down' });
  assert.equal(describeChange(-12.5, 'currency').spoken, 'down 12.50 USD', 'money keeps its cents');
});

test('with browser storage blocked, live price and briefing settings start from their defaults and still work', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  t.after(() => (previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage));
  const live = new LivePricesService();
  assert.deepEqual(live.settings(), parseLivePrices(undefined));
  live.setPaused(true);
  assert.equal(live.paused(), true, 'paused for this visit, though it cannot be saved');
  const briefing = new BriefingService();
  assert.equal(briefing.settings().voice, 'browser');
  briefing.update({ voice: 'screen-reader' });
  assert.equal(briefing.screenReader, true);
});

/** A novice dashboard on fake backends, for order tracking without rendering. */
async function noviceDesk(t, history) {
  withStorage(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const feed = fakeFeed([{ symbol: 'AAPL', name: 'Apple Inc.', price: 100, instrumentId: 'aapl-id' }]);
  const desk = component(t, NoviceDashboard, [feedProvider(feed)]);
  let reads = 0;
  desk.portfolioClient = { load: async () => ({ cash: 10000, holdings: [] }) };
  desk.orderSubmissionClient = {
    getAccounts: async () => [{ account_id: 'acct-1', account_status: 'ACTIVE', trading_enabled: true }],
    getInstruments: async () => [{ instrumentId: 'aapl-id', symbol: 'AAPL' }],
    submit: async () => ({ orderId: 'o1', status: 'SUBMITTED' }),
  };
  desk.orderHistoryClient = { list: async () => history[Math.min(reads++, history.length - 1)] };
  desk.cashActivityClient = { list: async () => [] };
  desk.loadChart = async () => {};
  await desk.ngOnInit(); await flush();
  return desk;
}
const row = (status, extra = {}) => ({ orderId: 'o1', symbol: 'AAPL', side: 'BUY', quantity: 2, status, submittedAt: new Date().toISOString(), fillPrice: null, filledQuantity: null, filledAt: null, ...extra });

test('a novice order is announced as sent, accepted and filled, once each', async (t) => {
  const desk = await noviceDesk(t, [[], [row('ACCEPTED')], [row('ACCEPTED')], [row('FILLED', { fillPrice: 101, filledQuantity: 2 })]]);
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('2'); desk.reviewTrade(); await desk.confirmTrade(); await flush();
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(2000); await flush(); }
  assert.deepEqual(desk.announcer.history, [
    { text: 'Buy 2 Apple, about $200.00, fills at up to $204.00', politeness: 'polite' },
    { text: 'Order sent: buy 2 shares of Apple.', politeness: 'polite' },
    { text: 'Order accepted: buy 2 shares of Apple. Waiting for it to fill.', politeness: 'polite' },
    { text: 'Filled: bought 2 shares of Apple at $101.00.', politeness: 'polite' },
  ]);
});

test('a novice rejection is announced at once, with its reason', async (t) => {
  const desk = await noviceDesk(t, [[row('REJECTED')]]);
  desk.orderStatusClient = { status: async () => ({ status: 'REJECTED', reasonCode: 'INSUFFICIENT_CASH' }) };
  await desk.trackOrder('o1');
  await desk.trackOrder('o1');
  assert.deepEqual(desk.announcer.history, [{
    text: 'Rejected: your order to buy 2 shares of Apple was not filled. There was not enough cash in this account to pay for it.',
    politeness: 'assertive',
  }]);
});

test('pressing Review again with the field already focused reads the error, since focus cannot move to it', async (t) => {
  const { fixture, desk, root } = await noviceTicket(t);
  const field = root.querySelector('#novice-shares');
  field.focus();
  desk.quantity.set('0'); desk.reviewTrade(); fixture.detectChanges();
  t.mock.timers.tick(1);
  assert.ok(browser.document.activeElement === field, 'the repeated-error scenario starts on the shares field');
  const said = desk.announcer.history.length;
  desk.reviewTrade(); fixture.detectChanges();
  assert.deepEqual(desk.announcer.history.slice(said), [{ text: 'Enter a whole number of shares greater than zero.', politeness: 'assertive' }]);
});

test('other novice trade messages are read too: a failed send every time, a background one once', async (t) => {
  const desk = await noviceDesk(t, [[]]);
  desk.orderSubmissionClient.submit = async () => { throw new Error('offline'); };
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('1'); desk.reviewTrade();
  await desk.confirmTrade(); await desk.confirmTrade();
  const failures = desk.announcer.history.filter((h) => h.text === 'Your order could not be sent. Please try again.');
  assert.equal(failures.length, 2, 'each press gets its answer');
  desk.orderHistoryClient = { list: async () => { throw new Error('Could not check your order.'); } };
  await desk.trackOrder('o1'); await desk.trackOrder('o1');
  assert.equal(desk.announcer.history.filter((h) => h.text === 'Could not check your order.').length, 1, 'a repeated poll failure is not repeated');
  assert.equal(desk.tradeMessage(), 'Could not check your order.');
});

// ---- Advanced trading -----------------------------------------------------------------------

async function advancedTicket(t) {
  withStorage(t);
  t.mock.method(AdvancedDashboard.prototype, 'ngOnInit', () => {});
  t.mock.method(StockDashboardComponent.prototype, 'ngAfterViewInit', () => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const feed = fakeFeed([{ symbol: 'AAPL', name: 'Apple Inc.', price: 100 }, { symbol: 'NVDA', name: 'NVIDIA', price: 0 }]);
  const fixture = await render(t, AdvancedDashboard, {}, [feedProvider(feed)]);
  const desk = fixture.componentInstance;
  desk.accountState.use([{ account_id: 'acct-1', account_name: 'Trading', account_number: '001', account_status: 'ACTIVE', trading_enabled: true }]);
  desk.instruments.set(feed.quotes().map((q) => ({ instrumentId: q.instrumentId, symbol: q.symbol })));
  desk.applyPortfolio({ cash: 150, holdings: [{ symbol: 'AAPL', quantity: 1, averageCost: 90 }] });
  fixture.detectChanges();
  return { fixture, desk, root: fixture.nativeElement };
}

test('an advanced quantity that cannot be traded is marked invalid and focused; a missing price is announced', async (t) => {
  const { fixture, desk, root } = await advancedTicket(t);
  desk.quantity.set('0'); desk.reviewOrder(); fixture.detectChanges();
  const field = root.querySelector('#pro-quantity');
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.equal(field.getAttribute('aria-describedby'), 'pro-quantity-error');
  assert.match(root.querySelector('#pro-quantity-error').textContent, /whole number of shares/);
  assert.equal(root.querySelector('.ticket-message').textContent.trim(), '');
  assert.equal(root.querySelector('.ticket-message').getAttribute('aria-live'), 'off');
  t.mock.timers.tick(1);
  assert.equal(browser.document.activeElement, field);
  desk.choose(desk.quote('NVDA')); desk.quantity.set('1'); desk.reviewOrder(); fixture.detectChanges();
  assert.equal(field.getAttribute('aria-invalid'), null, 'not the field’s fault');
  assert.deepEqual(desk.announcer.history.at(-1), { text: 'There is no live price for this stock yet. Try again in a moment.', politeness: 'assertive' });
  assert.match(root.querySelector('.ticket-message').textContent, /no live price/);
});

test('reviewing an advanced order announces the review once and focuses Confirm; tables have scope', async (t) => {
  const { fixture, desk, root } = await advancedTicket(t);
  desk.quantity.set('1'); desk.reviewOrder(); fixture.detectChanges();
  const confirm = root.querySelector('#pro-confirm');
  assert.equal(confirm.getAttribute('aria-describedby'), null, 'the review is announced, not repeated as a description');
  const summary = root.querySelector('#pro-review-summary').textContent.trim();
  assert.match(summary, /^Buy 1 AAPL/);
  assert.match(desk.announcer.history.at(-1).text, /^Buy 1 Apple, /);
  assert.equal(desk.announcer.history.at(-1).politeness, 'polite');
  t.mock.timers.tick(1);
  assert.equal(browser.document.activeElement, confirm);
  // A price rise after review fails the re-check: back on the field, marked invalid.
  desk.applyPortfolio({ cash: 50, holdings: [] });
  await desk.confirmOrder(); fixture.detectChanges();
  assert.equal(root.querySelector('#pro-quantity').getAttribute('aria-invalid'), 'true');
  for (const th of root.querySelectorAll('table th')) assert.equal(th.getAttribute('scope'), 'col');
  for (const table of root.querySelectorAll('table')) assert.ok(table.querySelector('caption'));
  assert.equal(root.querySelector('.market-status').getAttribute('role'), null);
});

test('an advanced order is announced as sent, accepted and filled once each, and a rejection cuts in', async (t) => {
  withStorage(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const feed = fakeFeed([{ symbol: 'AAPL', name: 'Apple Inc.', price: 100 }]);
  const desk = component(t, AdvancedDashboard, [feedProvider(feed)]);
  const history = [[row('ACCEPTED')], [row('ACCEPTED')], [row('FILLED', { fillPrice: 100, filledQuantity: 2 })]];
  let reads = 0;
  desk.orderHistoryClient = { list: async () => history[Math.min(reads++, history.length - 1)] };
  desk.portfolioClient = { load: async () => ({ cash: 1000, holdings: [] }) };
  desk.accountState.use([{ account_id: 'acct-1', account_status: 'ACTIVE', trading_enabled: true }]);
  desk.instruments.set([{ instrumentId: 'aapl-uuid', symbol: 'AAPL' }]);
  desk.applyPortfolio({ cash: 1000, holdings: [] });
  desk.choose(desk.quote('AAPL'));
  desk.orderSubmissionClient = { submit: async () => ({ orderId: 'o1', status: 'PENDING' }) };
  desk.trackOrder = async () => {};
  desk.quantity.set('2');
  await desk.confirmOrder();
  delete desk.trackOrder;
  await desk.trackOrder('o1');
  await desk.trackOrder('o1');
  await desk.trackOrder('o1');
  assert.deepEqual(desk.announcer.history.map((h) => h.text), [
    'Order sent: buy 2 shares of Apple.',
    'Order accepted: buy 2 shares of Apple. Waiting for it to fill.',
    'Filled: bought 2 shares of Apple at $100.00.',
  ]);
  assert.equal(desk.message(), 'Order o1 filled.', 'the ticket shows the step it has already said');
  desk.orderHistoryClient = { list: async () => [row('REJECTED', { orderId: 'o2' })] };
  desk.orderStatusClient = { status: async () => { throw new Error('down'); } };
  await desk.trackOrder('o2');
  assert.equal(desk.announcer.history.at(-1).politeness, 'assertive');
  assert.match(desk.announcer.history.at(-1).text, /^Rejected: your order to buy 2 shares of Apple was not filled\. It could not be completed/);
});

test('an advanced send that fails is read each time it is tried', async (t) => {
  const { desk } = await advancedTicket(t);
  desk.orderSubmissionClient = { submit: async () => { throw new Error('offline'); } };
  desk.choose(desk.quote('AAPL')); desk.quantity.set('1');
  await desk.confirmOrder(); await desk.confirmOrder();
  assert.equal(desk.announcer.history.filter((h) => h.text === 'Submission failed. Please try again.').length, 2);
  assert.equal(desk.ticketStatus(), 'Submission failed. Please try again.');
});

// ---- Briefing through the screen reader -----------------------------------------------------

test('with My screen reader chosen, the briefing skips the browser voice and is read once, in order, by a polite region', async (t) => {
  withStorage(t, { briefing: { rate: 1, everyMinutes: 0, voice: 'screen-reader' } });
  const spoken = [];
  const before = { synth: globalThis.speechSynthesis, utterance: globalThis.SpeechSynthesisUtterance };
  const calls = [];
  globalThis.speechSynthesis = { speak: (u) => { calls.push('speak'); spoken.push(u); }, cancel: () => calls.push('cancel'), getVoices: () => [] };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  t.after(() => { globalThis.speechSynthesis = before.synth; globalThis.SpeechSynthesisUtterance = before.utterance; });
  const service = new BriefingService();
  assert.equal(service.screenReader, true);
  service.play(['Good morning.', 'The market is open.'], new Date());
  assert.deepEqual(spoken, [], 'no speech synthesis');
  service.stop();
  assert.deepEqual(calls, [], 'not even a cancel: the browser voice is left alone');
  assert.deepEqual(service.lines(), ['Good morning.', 'The market is open.'], 'the transcript is still shown');
  assert.equal(service.speaking(), false);
  await sleep(ANNOUNCE_DELAY_MS + 20);
  const region = [...browser.document.querySelectorAll('[data-announcer="polite"]')].at(-1);
  assert.equal(region.textContent, 'Good morning. The market is open.');

  const fixture = await render(t, BriefingButton, { source: async () => { throw new Error('skip'); } });
  fixture.componentInstance.open.set(true);
  fixture.componentInstance.service.lines.set(['Hello.']);
  fixture.componentInstance.service.update({ voice: 'screen-reader' });
  fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.note').textContent, /Sent to your screen reader/);
  // The popover keeps only speed and repeat; who reads it is chosen in Settings > Accessibility.
  assert.deepEqual([...fixture.nativeElement.querySelectorAll('select')].map((s) => s.closest('label').textContent.trim().split(/\s/)[0]), ['Voice', 'Repeat']);
  assert.equal([...fixture.nativeElement.querySelectorAll('option')].some((o) => o.textContent.includes('My screen reader')), false);
});

test('Alt+B with My screen reader reads the whole briefing once, in order, with no browser voice', async (t) => {
  withStorage(t, { briefing: { rate: 1, everyMinutes: 0, voice: 'screen-reader' } });
  const before = { synth: globalThis.speechSynthesis, utterance: globalThis.SpeechSynthesisUtterance };
  const spoken = [];
  globalThis.speechSynthesis = { speak: (u) => spoken.push(u), cancel() {}, getVoices: () => [] };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  t.after(() => { globalThis.speechSynthesis = before.synth; globalThis.SpeechSynthesisUtterance = before.utterance; });
  const now = new Date(2026, 9, 16, 14, 5);
  const snapshot = {
    now, market: { open: true, exchangeTimeZone: 'America/New_York', nextOpen: '', nextClose: new Date(now.getTime() + 3600000).toISOString() },
    balanceHidden: false, total: 1000, gain: 10, gainPercent: 1, buyingPower: 500,
    holdings: [{ symbol: 'AAPL', name: 'Apple Inc.', dayChangePercent: 1.2 }], orders: [], since: null, pricesDelayed: false, locale: 'en-US',
  };
  const fixture = await render(t, BriefingButton, { source: async () => snapshot });
  const announcer = fixture.debugElement.injector.get(LiveAnnouncer);
  const said = announcer.history.length;
  browser.document.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'b', altKey: true, bubbles: true }));
  await sleep(ANNOUNCE_DELAY_MS + 20); fixture.detectChanges();
  const lines = fixture.componentInstance.service.lines();
  assert.ok(lines.length > 2, 'a full briefing');
  assert.deepEqual(announcer.history.slice(said), [{ text: lines.join(' '), politeness: 'polite' }], 'every sentence, in order, in one polite message');
  assert.deepEqual(spoken, [], 'the browser voice stays silent');
  assert.equal(fixture.nativeElement.querySelectorAll('.briefing-panel li').length, lines.length, 'the transcript is on screen too');
});

test('switching an active browser-voice briefing to My screen reader silences the browser voice', (t) => {
  withStorage(t, { briefing: { rate: 1, everyMinutes: 0 } });
  const before = { synth: globalThis.speechSynthesis, utterance: globalThis.SpeechSynthesisUtterance };
  let cancelled = 0;
  globalThis.speechSynthesis = { speak() {}, cancel: () => cancelled++, getVoices: () => [] };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  t.after(() => { globalThis.speechSynthesis = before.synth; globalThis.SpeechSynthesisUtterance = before.utterance; });
  const service = new BriefingService();
  assert.equal(service.settings().voice, 'browser', 'Browser voice is the default');
  service.play(['Good morning.'], new Date());
  assert.equal(service.speaking(), true);
  service.update({ voice: 'screen-reader' });
  assert.equal(service.speaking(), false);
  assert.ok(cancelled > 0);
  assert.equal(new BriefingService().settings().voice, 'screen-reader', 'remembered after a reload');
});

test('hidden balances redact average cost, account gains, Balances and all Exposure dialog values', async t => {
 const {fixture,desk,root} = await advancedTicket(t); desk.privateBalance.set(true); fixture.detectChanges();
 assert.doesNotMatch(root.querySelector('.position-sub').textContent, /\$/);
 assert.doesNotMatch(root.querySelector('.summary-metrics').textContent, /\$/);
 desk.bottomTab.set('Balances'); fixture.detectChanges(); assert.doesNotMatch(root.querySelector('.balance-details').textContent, /\$/);
 desk.openModal('exposure'); fixture.detectChanges(); assert.doesNotMatch(root.querySelector('dialog .review-details').textContent, /\$|%/);
});
test('the novice holding average cost is masked with hidden balances', async t => {
 const {fixture,desk,root} = await noviceTicket(t); desk.showBalance.set(false); fixture.detectChanges();
 assert.equal(root.querySelector('.holdings-table tbody td:nth-child(3)').textContent.trim(), 'Hidden');
});

test('limit and exit validation links and focuses the corresponding ticket field', async t => {
 const {fixture,desk,root} = await advancedTicket(t); desk.setOrderType('LIMIT'); desk.limitPrice.set('0'); desk.quantity.set('1'); fixture.detectChanges(); desk.reviewOrder(); fixture.detectChanges(); t.mock.timers.tick(1);
 const limit = root.querySelector('#pro-limit'); assert.equal(limit.getAttribute('aria-invalid'), 'true'); assert.equal(limit.getAttribute('aria-describedby'), 'pro-limit-error'); assert.ok(browser.document.activeElement === limit);
 desk.limitPrice.set('100'); desk.takeProfitEnabled.set(true); desk.takeProfit.set('90'); fixture.detectChanges(); desk.reviewOrder(); fixture.detectChanges(); t.mock.timers.tick(1);
 const profit = root.querySelector('#pro-profit'); assert.equal(profit.getAttribute('aria-invalid'), 'true'); assert.ok(browser.document.activeElement === profit); assert.equal(root.querySelector('#pro-quantity').getAttribute('aria-invalid'), null);
});
