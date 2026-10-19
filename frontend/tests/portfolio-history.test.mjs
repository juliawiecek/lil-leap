import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { signal } from '@angular/core';
const {
  CHART_PERIODS, chartRange, barStep, portfolioSeries, priceAt,
} = await import('../src/app/portfolio-history.ts');
const { PortfolioChart } = await import('../src/app/portfolio-chart.ts');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-19T15:00:00Z');

test('every period ends now and starts its own length back, but never before the account opened', () => {
  const longAgo = NOW - 400 * DAY;
  assert.deepEqual(chartRange('1D', NOW, longAgo), { start: NOW - DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('1W', NOW, longAgo), { start: NOW - 7 * DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('1M', NOW, longAgo), { start: NOW - 30 * DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('3M', NOW, longAgo), { start: NOW - 90 * DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('1Y', NOW, longAgo), { start: NOW - 365 * DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('ALL', NOW, longAgo), { start: longAgo, end: NOW, fromOpening: true });
  // An account opened three days ago: a day is a day, everything longer starts at the opening.
  const opened = NOW - 3 * DAY;
  assert.deepEqual(chartRange('1D', NOW, opened), { start: NOW - DAY, end: NOW, fromOpening: false });
  for (const period of ['1W', '1M', '3M', '1Y', 'ALL']) {
    assert.deepEqual(chartRange(period, NOW, opened), { start: opened, end: NOW, fromOpening: true }, period);
  }
  assert.deepEqual(chartRange('ALL', NOW, null), { start: NOW - DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('1W', NOW, NOW + HOUR), { start: NOW - 7 * DAY, end: NOW, fromOpening: false }, 'a future opening is ignored');
  assert.deepEqual([...CHART_PERIODS], ['1D', '1W', '1M', '3M', '1Y', 'ALL']);
});

test('price bars are as narrow as the span allows, within what the service returns', () => {
  const span = (ms) => ({ start: NOW - ms, end: NOW, fromOpening: false });
  assert.deepEqual(barStep(span(2 * HOUR)), { interval: '1m', limit: 121 });
  assert.deepEqual(barStep(span(DAY)), { interval: '5m', limit: 289 });
  assert.deepEqual(barStep(span(3 * DAY)), { interval: '15m', limit: 289 });
  assert.deepEqual(barStep(span(7 * DAY)), { interval: '1h', limit: 169 });
  assert.deepEqual(barStep(span(90 * DAY)), { interval: '1d', limit: 91 });
  assert.deepEqual(barStep(span(400 * DAY)), { interval: '1d', limit: 401 });
  assert.equal(barStep(span(800 * DAY)).limit, 500, 'never more than one request returns');
});

test('the value at each moment is cash then plus each holding at its price then', () => {
  const opened = NOW - 10 * HOUR;
  const range = chartRange('ALL', NOW, opened);
  const cash = [
    { at: opened, amount: 1000 },             // opening deposit
    { at: opened + 2 * HOUR, amount: -500 },  // buy 5 AAPL at 100
    { at: opened + 6 * HOUR, amount: 220 },   // sell 2 AAPL at 110
  ];
  const shares = [
    { at: opened + 2 * HOUR, symbol: 'AAPL', quantity: 5, price: 100 },
    { at: opened + 6 * HOUR, symbol: 'AAPL', quantity: -2, price: 110 },
  ];
  const prices = new Map([['AAPL', [
    { at: opened + 3 * HOUR, price: 104 }, { at: opened + 5 * HOUR, price: 108 }, { at: opened + 8 * HOUR, price: 90 },
  ]]]);
  const series = portfolioSeries(range, cash, shares, prices);
  assert.deepEqual(series.map((p) => [(p.at - opened) / HOUR, p.value]), [
    [0, 1000],    // only the deposit
    [2, 1020],    // 500 cash + 5 shares, no bar closed yet: the next recorded price, 104
    [3, 1020],    // 500 + 5 × 104
    [5, 1040],    // 500 + 5 × 108
    [6, 1044],    // 720 + 3 × 108
    [8, 990],     // 720 + 3 × 90
    [10, 990],
  ]);
  const live = portfolioSeries(range, cash, shares, prices, 1001.236);
  assert.equal(live.at(-1).value, 1001.24, 'the line ends at the live value shown above it');
});

test('a period that starts after earlier activity still counts it, and only draws inside the period', () => {
  const opened = NOW - 5 * DAY;
  const range = chartRange('1D', NOW, opened);
  const cash = [{ at: opened, amount: 1000 }, { at: opened + HOUR, amount: -400 }];
  const shares = [{ at: opened + HOUR, symbol: 'MSFT', quantity: 1, price: 400 }];
  const prices = new Map([['MSFT', [{ at: NOW - 2 * DAY, price: 410 }, { at: NOW - HOUR, price: 420 }]]]);
  const series = portfolioSeries(range, cash, shares, prices);
  assert.deepEqual(series.map((p) => p.value), [1010, 1020, 1020], 'starts from the price recorded before the period');
  assert.ok(series.every((p) => p.at >= range.start && p.at <= range.end));
  assert.equal(priceAt([], NOW), null);
  assert.equal(portfolioSeries(range, cash, shares, new Map())[0].value, 1000, 'with no prices at all, the fill price');
});

/** A chart whose inputs come from signals the test controls, as Angular's inputs would. */
function chartWith(t, points, range, period = '1D') {
  const chart = component(t, PortfolioChart);
  const inputs = { points: signal(points), range: signal(range), period: signal(period) };
  for (const [name, value] of Object.entries(inputs)) {
    t.mock.method(chart, name, () => value());
  }
  return { chart, inputs };
}
const day = { start: NOW - DAY, end: NOW, fromOpening: false };

test('the line is green when the period is up and red when it is down, with a spoken summary', t => {
  const { chart } = chartWith(t, [{ at: NOW - DAY, value: 1000 }, { at: NOW, value: 1050 }], day);
  assert.equal(chart.tone(), 'up');
  assert.match(chart.summary(), /^Portfolio value past day: from \$1000\.00 to \$1050\.00, up 5\.00%\./);
  assert.match(chart.path(), /^M0\.0,[\d.]+ L800\.0,[\d.]+$/);
  assert.equal(chart.baselineY(), chart.placed()[0].y, 'the dotted baseline sits at the starting value');
  const { chart: falling } = chartWith(t, [{ at: NOW - DAY, value: 1000 }, { at: NOW, value: 990 }], { ...day, fromOpening: true }, 'ALL');
  assert.equal(falling.tone(), 'down');
  assert.match(falling.summary(), /since opening.*down 1\.00%/);
  const { chart: empty } = chartWith(t, [], null);
  assert.equal(empty.summary(), 'Portfolio value chart');
  assert.equal(empty.path(), '');
  assert.equal(empty.active(), null);
});

test('the scale holds while new values fit, so live updates only move the end of the line', t => {
  const { chart, inputs } = chartWith(t, [{ at: NOW - DAY, value: 1000 }, { at: NOW - HOUR, value: 1100 }, { at: NOW, value: 1050 }], day);
  const first = chart.domain();
  const startY = chart.placed()[0].y;
  inputs.points.set([{ at: NOW - DAY, value: 1000 }, { at: NOW - HOUR, value: 1100 }, { at: NOW, value: 1060 }]);
  assert.equal(chart.domain(), first, 'a value inside the scale keeps it');
  assert.equal(chart.placed()[0].y, startY, 'so the rest of the line does not move');
  inputs.points.set([{ at: NOW - DAY, value: 1000 }, { at: NOW - HOUR, value: 1100 }, { at: NOW, value: 1300 }]);
  assert.notEqual(chart.domain(), first, 'a value outside it rescales');
  assert.ok(chart.domain().high > 1300);
  const rescaled = chart.domain();
  inputs.period.set('1W');
  assert.notEqual(chart.domain(), rescaled, 'a new period rescales');
});

test('hovering or arrow keys scrub along the line and report the point under the cursor', t => {
  const points = [{ at: NOW - DAY, value: 1000 }, { at: NOW - DAY / 2, value: 1020 }, { at: NOW, value: 1050 }];
  const { chart } = chartWith(t, points, day);
  const seen = [];
  chart.scrub.subscribe((p) => seen.push(p && p.value));
  const svg = { getBoundingClientRect: () => ({ left: 100, width: 400 }) };
  // A finger dragged across reports pointer events the same way a mouse does.
  chart.scrubAt({ currentTarget: svg, clientX: 290, pointerType: 'touch' });
  assert.equal(chart.active().value, 1020, 'nearest to the middle');
  chart.scrubAt({ currentTarget: svg, clientX: 295 });
  assert.deepEqual(seen, [1020], 'the same point is reported once');
  const key = (k) => ({ key: k, preventDefault: () => {} });
  chart.scrubKey(key('ArrowLeft'));
  chart.scrubKey(key('End'));
  chart.scrubKey(key('ArrowRight'));
  chart.scrubKey(key('Home'));
  assert.deepEqual(seen, [1020, 1000, 1050, 1000]);
  chart.scrubKey(key('Escape'));
  assert.equal(chart.active(), null);
  assert.equal(seen.at(-1), null);
  chart.scrubKey(key('a'));
  chart.endScrub();
  assert.equal(seen.length, 5, 'leaving again, or another key, reports nothing new');
  chart.scrubAt({ currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 0 }) }, clientX: 5 });
  assert.equal(chart.active(), null);
  assert.equal(chart.timeFormat(), 'MMM d, HH:mm');
  assert.deepEqual(chart.placed().map((p) => p.x), [0, 400, 800], 'evenly spaced, so closed hours take no room');
  chart.scrubKey(key('Home'));
  assert.equal(chart.labelLeft(), 8, 'the time label stays inside the chart at the left edge');
  chart.scrubKey(key('End'));
  assert.equal(chart.labelLeft(), 92);
  let picked = null;
  chart.periodChange.subscribe((p) => { picked = p; });
  chart.periodChange.emit('1M');
  assert.equal(picked, '1M');
});