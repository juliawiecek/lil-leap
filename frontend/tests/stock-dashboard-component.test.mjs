import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Subject, of } from 'rxjs';
import { browser, resolveTemplates, animateFrame } from './dom-helper.mjs';
import { ApiHttpClient } from './component-helper.mjs';
const { StockDashboardComponent, STOCK_DASHBOARD_TICKS, provideStockDashboardFeed } =
  await import('../src/app/stock-dashboard.component.ts');
const { QuoteService } = await import('../src/app/quote.service.ts');
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
const NOW = Date.parse('2026-10-20T16:00:00Z');
const tick = (price, seconds = 0, openPrice = 100) => ({
  symbol: 'AAPL',
  name: 'Apple Inc.',
  market: 'NASDAQ',
  currency: 'USD',
  price,
  openPrice,
  time: NOW / 1000 + seconds,
  synthetic: true,
});
async function dashboard(t, sampleMs = 5000) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: NOW });
  globalThis.ResizeObserver = browser.ResizeObserver;
  t.mock.method(browser.SVGElement.prototype, 'getBoundingClientRect', () => ({
    width: 600,
    height: 320,
    left: 0,
    top: 0,
  }));
  const feed = new Subject();
  let zoneEntries = 0;
  const zone = {
    runOutsideAngular: (callback) => callback(),
    run(callback) {
      zoneEntries++;
      return callback();
    },
  };
  t.after(() => TestBed.resetTestingModule());
  await resolveTemplates();
  TestBed.overrideComponent(StockDashboardComponent, {
    set: {
      template: readFileSync(
        new URL('../src/app/stock-dashboard.component.html', import.meta.url),
        'utf8',
      ),
      templateUrl: undefined,
      styleUrl: undefined,
      styles: [],
      providers: [{ provide: NgZone, useValue: zone }],
    },
  });
  TestBed.configureTestingModule({
    imports: [StockDashboardComponent],
    providers: [{ provide: STOCK_DASHBOARD_TICKS, useValue: feed }],
  });
  const fixture = TestBed.createComponent(StockDashboardComponent);
  fixture.componentRef.setInput('sampleMs', sampleMs);
  fixture.detectChanges();
  return {
    feed,
    fixture,
    get zoneEntries() {
      return zoneEntries;
    },
    sample(ms = sampleMs) {
      t.mock.timers.tick(ms);
      animateFrame(performance.now() + 1000);
      fixture.detectChanges();
    },
    get line() {
      return fixture.nativeElement.querySelector('[data-line]');
    },
    get gradient() {
      return fixture.nativeElement.querySelector('linearGradient stop');
    },
  };
}
test('sampled quotes update performance metrics while the area chart keeps its fixed emerald style', async (t) => {
  const d = await dashboard(t);
  d.feed.next(tick(101));
  d.feed.next(tick(104));
  assert.equal(d.fixture.componentInstance.asset(), null);
  assert.equal(d.zoneEntries, 0);
  d.sample();
  assert.equal(d.fixture.componentInstance.asset().price, 104);
  assert.equal(d.fixture.componentInstance.asset().changePercent, 4);
  assert.match(
    d.fixture.nativeElement.querySelector('.performance-badge').textContent,
    /\+\$4\.00/,
  );
  assert.equal(d.line.getAttribute('stroke'), 'var(--area-line)');
  assert.equal(d.line.getAttribute('stroke-width'), '2');
  assert.equal(d.gradient.getAttribute('stop-color'), 'var(--area-top)');
  assert.equal(
    d.fixture.nativeElement.querySelector('stop[offset="100%"]').getAttribute('stop-color'),
    'var(--gain-wash-28)',
  );
  d.feed.next(tick(98, 5));
  d.sample();
  assert.equal(d.line.getAttribute('stroke'), 'var(--area-line)');
  assert.equal(d.gradient.getAttribute('stop-color'), 'var(--area-top)');
  d.feed.next(tick(100, 10));
  d.sample();
  assert.equal(d.line.getAttribute('stroke'), 'var(--area-line)');
  assert.equal(
    d.fixture.nativeElement.querySelector('[data-line]'),
    d.line,
    'the same SVG element survives performance changes',
  );
  assert.equal(d.fixture.nativeElement.querySelector('canvas'), null);
});
test('missing baseline stays unknown and older/invalid quotes cannot replace the latest', async (t) => {
  const d = await dashboard(t);
  d.feed.next(tick(101, 2, null));
  d.feed.next(tick(99, 1, null));
  d.feed.next(tick(NaN, 3));
  d.sample();
  assert.equal(d.fixture.componentInstance.asset().price, 101);
  assert.equal(d.fixture.componentInstance.asset().change, null);
  assert.equal(d.line.getAttribute('stroke'), 'var(--area-line)');
});
test('duplicate quotes stay quiet while changes to quote metadata still render', async (t) => {
  const d = await dashboard(t);
  let quote = tick(101);
  d.feed.next(quote);
  d.sample();
  const original = d.fixture.componentInstance.asset();
  const entries = d.zoneEntries;
  d.feed.next({ ...quote });
  d.sample();
  assert.equal(d.fixture.componentInstance.asset(), original);
  assert.equal(d.zoneEntries, entries);

  const changes = [
    { openPrice: 99 },
    { currency: 'EUR' },
    { symbol: 'MSFT' },
    { market: 'NYSE' },
    { price: 102 },
    { time: NOW / 1000 + 1 },
    { history: [{ time: NOW / 1000 - 10, price: 100 }] },
  ];
  for (const change of changes) {
    const previous = d.fixture.componentInstance.asset();
    quote = { ...quote, ...change };
    d.feed.next(quote);
    d.sample();
    assert.notEqual(d.fixture.componentInstance.asset(), previous);
    assert.equal(d.fixture.componentInstance.asset().price, quote.price);
    assert.equal(d.fixture.componentInstance.asset().currency, quote.currency);
    assert.equal(d.fixture.componentInstance.asset().openPrice, quote.openPrice);
  }
});

test('ten-second chart sampling leaves a raw stream subscriber live', async (t) => {
  const d = await dashboard(t, 10000),
    raw = [];
  const subscription = d.feed.subscribe((value) => raw.push(value));
  t.after(() => subscription.unsubscribe());
  d.feed.next(tick(101));
  d.sample(5000);
  assert.equal(d.fixture.componentInstance.asset(), null);
  assert.equal(raw.length, 1);
  d.feed.next(tick(102, 5));
  d.sample(5000);
  assert.equal(raw.length, 2);
  assert.equal(d.fixture.componentInstance.asset().price, 102);
});
test('changing the sampling interval preserves the pending latest quote and existing history', async (t) => {
  const d = await dashboard(t);
  d.feed.next(tick(101));
  d.sample();
  const line = d.line;
  d.feed.next(tick(102, 5));
  d.sample(1000);
  d.fixture.componentRef.setInput('sampleMs', 10000);
  d.fixture.detectChanges();
  assert.equal(d.feed.observers.length, 1);
  assert.equal(d.fixture.componentInstance.asset().price, 101);
  d.sample(9999);
  assert.equal(d.fixture.componentInstance.asset().price, 101);
  d.sample(1);
  assert.equal(d.fixture.componentInstance.asset().price, 102);
  assert.equal(d.line, line);
});
test('history loads with its initial performance theme and keyboard inspection freezes the chart until Escape', async (t) => {
  const d = await dashboard(t);
  d.feed.next({
    ...tick(98),
    history: [
      { time: NOW / 1000 - 60, price: 105 },
      { time: NOW / 1000 - 30, price: 102 },
    ],
  });
  d.sample();
  assert.equal(d.line.getAttribute('stroke'), 'var(--area-line)');
  const path = d.line.getAttribute('d'),
    svg = d.fixture.nativeElement.querySelector('app-stock-svg-chart svg');
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  const tooltip = d.fixture.nativeElement.querySelector('.tooltip');
  assert.match(tooltip.textContent, /105/);
  assert.equal(tooltip.hidden, false);
  d.feed.next(tick(99, 5));
  d.sample();
  assert.equal(d.line.getAttribute('d'), path);
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape' }));
  animateFrame(performance.now() + 1000);
  assert.equal(tooltip.hidden, true);
  assert.notEqual(d.line.getAttribute('d'), path);
});
test('errors retain the chart and teardown removes the subscription', async (t) => {
  const d = await dashboard(t);
  d.feed.next(tick(105));
  d.sample();
  d.feed.error(new Error('Do not expose authentication details'));
  d.fixture.detectChanges();
  assert.equal(d.fixture.componentInstance.state().connection, 'offline');
  assert.equal(d.fixture.componentInstance.asset().price, 105);
  assert.doesNotMatch(d.fixture.nativeElement.textContent, /authentication details/);
  d.fixture.destroy();
  assert.equal(d.feed.observed, false);
});
test('a completed source is marked offline instead of claiming a live connection', async (t) => {
  const d = await dashboard(t);
  d.feed.next(tick(101));
  d.sample();
  d.feed.complete();
  d.fixture.detectChanges();
  assert.equal(d.fixture.componentInstance.state().connection, 'offline');
  assert.equal(d.fixture.componentInstance.asset().price, 101);
});
test('an idle source times out after fifteen seconds', async (t) => {
  const d = await dashboard(t);
  t.mock.timers.tick(15000);
  d.fixture.detectChanges();
  assert.equal(d.fixture.componentInstance.state().connection, 'offline');
  assert.equal(d.feed.observed, false);
});
test('the backend adapter requests authenticated quotes, history and the actual current-session open', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: NOW });
  const requests = [];
  let openRows = [{ instrumentId: 'asset-id', midpoint: '100', quotedAt: '2026-10-20T13:30:00Z' }];
  let historyReads = 0;
  TestBed.configureTestingModule({
    providers: [
      provideStockDashboardFeed({ symbol: 'AAPL', name: 'Apple Inc.', market: 'NASDAQ' }),
      {
        provide: QuoteService,
        useValue: {
          getLatestByMarketSymbol: () =>
            of({
              symbol: 'AAPL',
              marketCode: 'NASDAQ',
              instrumentId: 'asset-id',
              midpoint: '104',
              currency: 'USD',
              quotedAt: new Date(NOW).toISOString(),
              synthetic: true,
            }),
          getHistory: () => {
            historyReads++;
            return of([
              { quotedAt: new Date(NOW - 5000).toISOString(), midpoint: '103' },
              { quotedAt: new Date(NOW - 10000).toISOString(), midpoint: '102' },
            ]);
          },
        },
      },
      {
        provide: ApiHttpClient,
        useValue: {
          get: (url, options) => {
            requests.push([url, options]);
            return of(openRows);
          },
        },
      },
    ],
  });
  const received = [];
  const subscription = TestBed.inject(STOCK_DASHBOARD_TICKS).subscribe((value) =>
    received.push(value),
  );
  t.after(() => {
    subscription.unsubscribe();
    TestBed.resetTestingModule();
  });
  t.mock.timers.tick(1);
  assert.equal(received[0].price, 104);
  assert.equal(received[0].openPrice, 100);
  assert.equal(received[0].history[0].price, 102);
  assert.equal(
    received[0].history.at(-1).price,
    103,
    'newest-first backend history is normalized chronologically',
  );
  assert.equal(requests[0][1].params.ids, 'asset-id');
  openRows = [{ instrumentId: 'asset-id', midpoint: '100', quotedAt: '2026-10-19T20:00:00Z' }];
  t.mock.timers.tick(1000);
  assert.equal(
    received.at(-1).openPrice,
    100,
    'the established opening value survives a transient fallback response',
  );
  openRows = [];
  t.mock.timers.tick(1000);
  assert.equal(
    received.at(-1).openPrice,
    100,
    'the established opening value survives missing data',
  );
  assert.equal(historyReads, 1, 'history is fetched once and retained across the sample window');
});
