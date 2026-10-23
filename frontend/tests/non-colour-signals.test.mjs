import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
const { describeChange, FinancialChange } = await import('../src/app/financial-change.ts');
const { statusPresentation, StatusBadge } = await import('../src/app/status-badge.ts');
const { PriceFlash } = await import('../src/app/price-flash.ts');
const { TechnicalChart } = await import('../src/app/technical-chart.ts');
const { ema, vwap, indicators, placeEndLabels, displayCandles } = await import('../src/app/technical-chart-math.ts');
const { candleMetadata } = await import('../src/app/market-feed-api.ts');
const { marketStatusLabel } = await import('../src/app/market-status-api.ts');

const start = Date.parse('2026-10-21T13:30:00Z');
function bars(count = 220, volume = 10) {
  return Array.from({ length: count }, (_, i) => ({ at: start + i * 60000, price: 100 + i / 10,
    candle: { time: start + i * 60000, open: 100 + i / 10 + (i % 2 ? 1 : -1), high: 103 + i / 10, low: 97 + i / 10, close: 100 + i / 10, volume } }));
}

test('financial changes have exact signs/arrows, neutral zeroes, localized precision and meaningful speech', () => {
  assert.deepEqual(describeChange(2.45), { visual: '▲ +2.45%', spoken: 'Increased by 2.45 percent', direction: 'up' });
  assert.equal(describeChange(-1.82).visual, '▼ −1.82%');
  for (const zero of [0, -0]) assert.deepEqual(describeChange(zero), { visual: '— 0.00%', spoken: 'Unchanged at 0.00 percent', direction: 'flat' });
  assert.equal(describeChange(-12.5, 'currency').visual, '▼ −$12.50');
  assert.equal(describeChange(1234.5, 'number', 'USD', 'en-US', '1.3-3').visual, '▲ +1,234.500');
  assert.equal(describeChange(100, 'currency', 'JPY').spoken, 'Increased by 100 JPY');
  for (const invalid of [null, NaN, Infinity]) assert.equal(describeChange(invalid).spoken, 'Change unavailable');
});

test('financial visual symbols are hidden from speech and changes update without live announcements', async t => {
  const fixture = await render(t, FinancialChange, { value: 2.45 });
  assert.equal(fixture.nativeElement.querySelector('[aria-hidden=true]').textContent, '▲ +2.45%');
  assert.equal(fixture.nativeElement.querySelector('.sr-only').textContent, 'Increased by 2.45 percent');
  assert.equal(fixture.nativeElement.querySelector('[aria-live]'), null);
  fixture.componentRef.setInput('value', -2.45); fixture.detectChanges();
  assert.equal(fixture.nativeElement.getAttribute('data-movement'), 'down');
  fixture.componentRef.setInput('value', 0); fixture.detectChanges();
  assert.ok(fixture.nativeElement.classList.contains('flat'));
});

test('statuses expose words and distinct icons without changing backend values', async t => {
  for (const [value, word] of [['FILLED', 'Filled'], ['REJECTED', 'Rejected'], ['PENDING', 'Pending'], ['SETTLED', 'Settled'], ['OPEN', 'Open'], ['CLOSED', 'Closed']]) assert.equal(statusPresentation(value).label, word);
  assert.equal(statusPresentation(null).label, 'Unknown');
  assert.equal(statusPresentation('PARTIALLY_FILLED').label, 'Partially filled');
  const fixture = await render(t, StatusBadge, { value: 'REJECTED' });
  assert.match(fixture.nativeElement.textContent, /Rejected/);
  assert.equal(fixture.nativeElement.querySelector('[aria-hidden=true]').textContent, '!');
});

test('a quoted percentage carries its sign without repeating the leading arrow', async t => {
  assert.equal(describeChange(1.23, 'percent', 'USD', 'en-US', undefined, false).visual, '+1.23%');
  assert.equal(describeChange(-1.23, 'percent', 'USD', 'en-US', undefined, false).visual, '−1.23%');
  assert.equal(describeChange(0, 'percent', 'USD', 'en-US', undefined, false).visual, '0.00%');
  assert.equal(describeChange(-1.23, 'percent', 'USD', 'en-US', undefined, false).spoken, 'minus 1.23 percent');
  const fixture = await render(t, FinancialChange, { value: 12.34, percent: 1.23, unit: 'currency' });
  const visual = fixture.nativeElement.querySelector('[aria-hidden=true]').textContent;
  assert.equal(visual, '▲ +$12.34 (+1.23%)');
  assert.equal(visual.match(/▲/g).length, 1, 'the triangle is not repeated inside the brackets');
  assert.equal(fixture.nativeElement.querySelector('.sr-only').textContent, 'Increased by 12.34 USD, 1.23 percent');
});

test('the market status spells out Open or Closed exactly once', () => {
  const now = new Date('2026-10-21T14:00:00Z');
  const open = { open: true, exchangeTimeZone: 'America/New_York', nextOpen: '2026-10-22T13:30:00Z', nextClose: '2026-10-21T20:00:00Z' };
  assert.equal(marketStatusLabel(open, now), 'Open · Market closes in 6h 0m');
  const soon = { ...open, open: false, nextOpen: '2026-10-21T17:00:00Z' };
  assert.equal(marketStatusLabel(soon, now), 'Closed · Market opens in 3h 0m');
  // The far-off wording already begins "Market closed", so no second "Closed ·" is added.
  const later = { ...open, open: false, nextOpen: '2026-10-26T13:30:00Z' };
  const label = marketStatusLabel(later, now);
  assert.match(label, /^Market closed · Opens /);
  assert.equal(label.match(/closed/gi).length, 1);
  assert.equal(marketStatusLabel(null, now), 'Market status unavailable');
});

test('price flash keeps a reserved slot even without a movement and does not announce live updates', async t => {
  const fixture = await render(t, PriceFlash, { direction: null });
  const slot = fixture.nativeElement.querySelector('.flash-cue');
  assert.equal(slot.textContent, '');
  fixture.componentRef.setInput('direction', 'down'); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('.flash-cue'), slot);
  assert.equal(slot.textContent, '▼');
  assert.equal(slot.getAttribute('aria-hidden'), 'true');
  assert.equal(fixture.nativeElement.querySelector('[aria-live]'), null);
});

test('OHLC metadata validates actual extrema and never invents volume', () => {
  const row = { time: new Date(start).toISOString(), open: '10', high: '12', low: '9', close: '11' };
  assert.equal(candleMetadata(row).volume, null);
  assert.equal(candleMetadata({ ...row, high: 9 }), undefined);
  assert.equal(candleMetadata({ ...row, low: 13 }), undefined);
  assert.equal(candleMetadata({ ...row, volume: -1 }).volume, null);
  assert.equal(candleMetadata({ ...row, volume: '20' }).volume, 20);
});

test('EMA uses the real SMA seed, actual timestamps and full input without mutating it', () => {
  const points = [{ at: 1, price: 2 }, { at: 2, price: 4 }, { at: 3, price: 6 }, { at: 4, price: 8 }];
  const saved = structuredClone(points);
  assert.deepEqual(ema(points, 3), [{ at: 3, price: 4 }, { at: 4, price: 6 }]);
  assert.deepEqual(ema(points, 50), []);
  assert.deepEqual(points, saved);
});

test('VWAP requires reported volume, resets per exchange day and handles zero volume', () => {
  const points = bars(2);
  points[0].candle.high = points[0].candle.low = points[0].candle.close = 10;
  points[1].candle.high = points[1].candle.low = points[1].candle.close = 20;
  points[1].candle.volume = 30;
  assert.equal(vwap(points).at(-1).price, 17.5);
  assert.deepEqual(vwap(bars(2, null)), []);
  assert.deepEqual(vwap(bars(2, 0)), []);
  points[1].candle.time += 86400000; points[1].at += 86400000;
  assert.equal(vwap(points).at(-1).price, 20);
});

test('indicator styles, adaptive end-label layout and candle reduction retain meaning and extremes', () => {
  const points = bars(), original = structuredClone(points);
  assert.deepEqual(indicators(points).map(s => s.dash), ['', '8 5', '1 5']);
  assert.ok(indicators(points).every(s => s.points.length));
  const reduced = displayCandles(points, 20);
  assert.ok(reduced.length <= 20);
  assert.equal(reduced[0].candle.open, points[0].candle.open);
  assert.equal(reduced.at(-1).candle.close, points.at(-1).candle.close);
  assert.equal(Math.max(...reduced.map(p => p.candle.high)), Math.max(...points.map(p => p.candle.high)));
  assert.deepEqual(points, original);
  const labels = placeEndLabels([{ y: -10 }, { y: 179 }, { y: 179 }], 180, 28);
  assert.ok(labels.every(l => l.labelY >= 10 && l.labelY <= 170));
  assert.ok(labels.every((l, i) => !i || l.labelY - labels[i - 1].labelY >= 28));
});

test('technical chart renders actual hollow/filled candles, patterned volume, all indicator labels and keyboard selection', async t => {
  const points = bars();
  const fixture = await render(t, TechnicalChart, { points, window: { start, end: points.at(-1).at }, symbol: 'AAPL' });
  const root = fixture.nativeElement;
  assert.ok(root.querySelector('.candle.up .candle-body'));
  assert.ok(root.querySelector('.candle.down .candle-body'));
  assert.ok(root.querySelector('.volume-bar.down').getAttribute('fill').startsWith('url(#technical-'));
  assert.equal(root.querySelectorAll('.indicator-label').length, 3);
  const plot = root.querySelector('.technical-plot');
  plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); fixture.detectChanges();
  assert.match(root.querySelector('.candle-detail').textContent, /open .*high .*low .*close/);
  plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
  assert.equal(root.querySelector('.candle-detail'), null);
  fixture.componentInstance.changeZoom(2); fixture.componentInstance.pan(-1); fixture.detectChanges();
  const frozenEnd = fixture.componentInstance.viewport().end;
  fixture.componentRef.setInput('window', { start, end: points.at(-1).at + 5000 }); fixture.detectChanges();
  assert.equal(fixture.componentInstance.viewport().end, frozenEnd, 'inspecting earlier data stays anchored during live updates');
  fixture.componentRef.setInput('points', bars(220, null)); fixture.detectChanges();
  assert.match(root.textContent, /Volume unavailable/);
  assert.equal(root.querySelector('[data-indicator=VWAP].indicator-line'), null);
});

test('technical chart ignores keys it does not handle and follows its measured width', async t => {
  let observed;
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { observers.push(callback); }
    observe(element) { observed = element; }
    disconnect() {}
  };
  t.after(() => { delete globalThis.ResizeObserver; });
  const points = bars();
  const fixture = await render(t, TechnicalChart, { points, window: { start, end: points.at(-1).at }, symbol: 'AAPL' });
  const chart = fixture.componentInstance;
  const plot = fixture.nativeElement.querySelector('.technical-plot');
  const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
  plot.dispatchEvent(other); fixture.detectChanges();
  assert.equal(other.defaultPrevented, false);
  assert.equal(chart.inspected(), null);
  assert.ok(observed, 'the chart observes its own size');
  observers[0]([{ contentRect: { width: 812.4 } }]);
  assert.equal(chart.width(), 812);
  observers[0]([{ contentRect: { width: 0 } }]);
  assert.equal(chart.width(), 812, 'a hidden chart keeps its last width');
});
