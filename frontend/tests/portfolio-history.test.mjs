import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const {
  CHART_PERIODS, chartRange, barStep, portfolioSeries, priceAt, valueAxis, timeAxis, valuePath,
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

test('axes fit the line, with cents when the range is small, and times worded for the span', () => {
  const tight = valueAxis([{ at: 0, value: 25000 }, { at: 1, value: 25002 }]);
  assert.equal(tight.cents, true);
  assert.ok(tight.high > 25002 && tight.low < 25000 && tight.high - tight.low < 10);
  const wide = valueAxis([{ at: 0, value: 1000 }, { at: 1, value: 2000 }]);
  assert.equal(wide.cents, false);
  assert.deepEqual(wide.labels, [2150, 1716.67, 1283.33, 850]);
  assert.equal(valueAxis([]).labels.length, 4);
  const day = timeAxis(chartRange('1D', NOW, null), 'en-GB', 'UTC');
  assert.deepEqual(day, ['15:00', '21:00', '03:00', '09:00', '15:00']);
  assert.match(timeAxis(chartRange('1W', NOW, null), 'en-GB', 'UTC')[0], /^Mon 15:00$/);
  assert.deepEqual(timeAxis(chartRange('1M', NOW, null), 'en-GB', 'UTC').at(-1), '19 Oct');
  const range = { start: 0, end: 100, fromOpening: false };
  assert.equal(valuePath([{ at: 0, value: 10 }, { at: 100, value: 0 }], range, { high: 10, low: 0 }, 200, 50), 'M0.0,0.0 L200.0,50.0');
});

/** A chart whose inputs are fixed before anything reads them. */
function chartWith(t, points, range) {
  const chart = component(t, PortfolioChart);
  t.mock.method(chart, 'points', () => points);
  t.mock.method(chart, 'range', () => range);
  return chart;
}

test('the chart reports its period change, the opening note and a spoken summary', t => {
  const day = { start: NOW - DAY, end: NOW, fromOpening: false };
  const chart = chartWith(t, [{ at: NOW - DAY, value: 1000 }, { at: NOW, value: 1050 }], day);
  assert.deepEqual(chart.change(), { amount: 50, percent: 5 });
  assert.equal(chart.periodLabel(), 'past day');
  assert.equal(chart.summary(), 'Portfolio value past day: from $1000.00 to $1050.00, up 5.00%');
  assert.ok(chart.path().startsWith('M0.0,'));
  assert.equal(chart.times().length, 5);
  const opening = chartWith(t, [{ at: NOW - DAY, value: 1000 }, { at: NOW, value: 990 }], { ...day, fromOpening: true });
  assert.equal(opening.periodLabel(), 'since opening');
  assert.match(opening.summary(), /down 1\.00%$/);
  const empty = chartWith(t, [], null);
  assert.equal(empty.change(), null);
  assert.equal(empty.summary(), 'Portfolio value chart');
  assert.equal(empty.path(), '');
  assert.deepEqual(empty.times(), []);
  let picked = null;
  chart.periodChange.subscribe((p) => { picked = p; });
  chart.periodChange.emit('1M');
  assert.equal(picked, '1M');
});
