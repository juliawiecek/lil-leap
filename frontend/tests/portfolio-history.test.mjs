import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { signal } from '@angular/core';
const {
  CHART_PERIODS, chartRange, barStep, portfolioSeries, priceAt, valueScale, tradingSession, startValue,
} = await import('../src/app/portfolio-history.ts');
const { PortfolioChart } = await import('../src/app/portfolio-chart.ts');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-19T15:00:00Z');

test('every period ends now and never reaches before account opening', () => {
  const longAgo = NOW - 400 * DAY;
  assert.deepEqual(chartRange('1D', NOW, longAgo), { start: NOW - DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('1W', NOW, longAgo), { start: NOW - 7 * DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('1M', NOW, longAgo), { start: NOW - 30 * DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('3M', NOW, longAgo), { start: NOW - 90 * DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('1Y', NOW, longAgo), { start: NOW - 365 * DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('ALL', NOW, longAgo), { start: longAgo, end: NOW, fromOpening: true });
  // No period asserts a valuation before the account existed.
  const opened = NOW - 3 * DAY;
  assert.deepEqual(chartRange('1D', NOW, opened), { start: NOW - DAY, end: NOW, fromOpening: false });
  for (const period of ['1W', 'ALL']) {
    assert.deepEqual(chartRange(period, NOW, opened), { start: opened, end: NOW, fromOpening: true }, period);
  }
  assert.deepEqual(chartRange('1M', NOW, opened), { start: opened, end: NOW, fromOpening: true });
  assert.deepEqual(chartRange('3M', NOW, opened), { start: opened, end: NOW, fromOpening: true });
  assert.deepEqual(chartRange('1Y', NOW, opened), { start: opened, end: NOW, fromOpening: true });
  assert.deepEqual(chartRange('ALL', NOW, null), { start: NOW - DAY, end: NOW, fromOpening: false });
  assert.deepEqual(chartRange('1W', NOW, NOW + HOUR), { start: NOW - 7 * DAY, end: NOW, fromOpening: false }, 'a future opening is ignored');
  assert.deepEqual([...CHART_PERIODS], ['1D', '1W', '1M', '3M', '1Y', 'ALL']);
});

test('1D is the latest trading session: 9:30 to 16:00 New York time on a weekday', () => {
  // NOW is Monday 19 October 2026, 11:00 in New York (UTC−4).
  const monday = { open: Date.parse('2026-10-19T13:30:00Z'), close: Date.parse('2026-10-19T20:00:00Z') };
  const friday = { open: Date.parse('2026-10-16T13:30:00Z'), close: Date.parse('2026-10-16T20:00:00Z') };
  assert.deepEqual(tradingSession(NOW), monday, 'open now: today’s');
  assert.deepEqual(tradingSession(Date.parse('2026-10-19T23:00:00Z')), monday, 'after the close: still today’s');
  assert.deepEqual(tradingSession(Date.parse('2026-10-19T12:00:00Z')), friday, 'Monday before the open: Friday’s');
  assert.deepEqual(tradingSession(Date.parse('2026-10-18T15:00:00Z')), friday, 'Sunday: Friday’s');
  assert.deepEqual(
    tradingSession(Date.parse('2026-11-02T15:00:00Z')),
    { open: Date.parse('2026-11-02T14:30:00Z'), close: Date.parse('2026-11-02T21:00:00Z') },
    'after the clocks change: UTC−5',
  );
  // The chart covers the session from its open up to now.
  assert.deepEqual(chartRange('1D', NOW, NOW - 400 * DAY, monday), { start: monday.open, end: NOW, fromOpening: false, session: monday });
  assert.deepEqual(chartRange('1D', monday.close + HOUR, NOW - DAY, monday).end, monday.close, 'after the close it ends at the close');
  assert.deepEqual(chartRange('1D', NOW, NOW - HOUR, monday), { start: NOW - HOUR, end: NOW, fromOpening: true, session: monday }, 'opened mid-session');
  assert.deepEqual(chartRange('1D', NOW + 9 * HOUR, NOW + 8 * HOUR, monday), { start: NOW + 8 * HOUR, end: NOW + 9 * HOUR, fromOpening: true }, 'opened after the session: since opening');
  assert.equal(chartRange('1W', NOW, NOW - 400 * DAY, monday).session, undefined, 'only 1D is a session');
});

test('price bars are as narrow as the span allows, within what the service returns', () => {
  const span = (ms) => ({ start: NOW - ms, end: NOW, fromOpening: false });
  assert.deepEqual(barStep(span(2 * HOUR)), { interval: '1m', limit: 121, ms: 60000 });
  assert.deepEqual(barStep(span(DAY)), { interval: '5m', limit: 289, ms: 300000 });
  assert.deepEqual(barStep(span(3 * DAY)), { interval: '15m', limit: 289, ms: 900000 });
  assert.deepEqual(barStep(span(7 * DAY)), { interval: '1h', limit: 169, ms: 3600000 });
  assert.deepEqual(barStep(span(90 * DAY)), { interval: '1d', limit: 91, ms: 86400000 });
  assert.deepEqual(barStep(span(400 * DAY)), { interval: '1d', limit: 401, ms: 86400000 });
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
  // A moment (1 ms) before each fill as well, so the line steps at it.
  const before = (hours) => hours - 1 / HOUR;
  assert.deepEqual(series.map((p) => [(p.at - opened) / HOUR, p.value]), [
    [3, 1020],          // 500 + 5 × 104
    [5, 1040],          // 500 + 5 × 108
    [before(6), 1040],  // just before the sell
    [6, 1044],          // 720 + 3 × 108
    [8, 990],           // 720 + 3 × 90
    [10, 990],
  ]);
  const live = portfolioSeries(range, cash, shares, prices, 1001.236);
  assert.equal(live.at(-1).value, 1001.236, 'calculation precision is preserved until formatting');
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
  assert.deepEqual(portfolioSeries(range, cash, shares, new Map()), [], 'a fill is not a substitute for a market price');
});

test('a month view of a three-day-old account starts at its actual opening', () => {
  const opened = NOW - 3 * DAY;
  const range = chartRange('1M', NOW, opened);
  const series = portfolioSeries(range, [{ at: opened, amount: 25000 }], [], new Map());
  assert.deepEqual(series.map((p) => [p.at, p.value]), [[opened, 25000], [NOW, 25000]]);
  assert.equal(startValue(series), 25000, 'its change is measured from when it held money');
  assert.equal(startValue([{ at: 0, value: 0 }, { at: 1, value: 0 }]), 0);
  assert.equal(startValue([]), 0);
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
  assert.match(chart.summary(), /^Portfolio value today: from \$1000\.00 to \$1050\.00, up 5\.00%\./);
  assert.match(chart.path(), /^M0,[\d.]+ C.+800,[\d.]+$/);
  assert.equal(chart.baselineY(), chart.placed()[0].y, 'the dotted baseline sits at the starting value');
  const { chart: falling } = chartWith(t, [{ at: NOW - DAY, value: 1000 }, { at: NOW, value: 990 }], { ...day, fromOpening: true }, 'ALL');
  assert.equal(falling.tone(), 'down');
  assert.match(falling.summary(), /since opening.*down 1\.00%/);
  const { chart: empty } = chartWith(t, [], null);
  assert.equal(empty.summary(), 'Portfolio value chart');
  assert.equal(empty.path(), '');
  assert.equal(empty.active(), null);
});

test('1D fills the chart from the open to now: each value sits at its time, with no axes', t => {
  const session = { open: Date.parse('2026-10-19T13:30:00Z'), close: Date.parse('2026-10-19T20:00:00Z') };
  const range = { start: session.open, end: NOW, fromOpening: false, session };
  const { chart, inputs } = chartWith(t, [{ at: session.open, value: 20000 }, { at: NOW - HOUR, value: 19000 }], range);
  chart.setDayView('full');
  // Live values keep arriving after the period loaded: 19,000 then 19,100, each kept on the line.
  inputs.points.set([{ at: session.open, value: 20000 }, { at: NOW - HOUR, value: 19000 }, { at: NOW, value: 19100 }]);
  const placed = chart.placed();
  assert.deepEqual(placed.map((p) => p.value), [20000, 19000, 19100], 'the dip and the recovery both stay');
  assert.ok(placed[1].y > placed[0].y && placed[2].y < placed[1].y, 'down to 19,000, then up to 19,100');
  assert.equal(placed[0].x, 0, 'the open is the left edge');
  assert.equal(placed.at(-1).x, 800, 'now is the right edge: no room for hours still to come');
  assert.equal(Math.round(placed[1].x), 267, 'placed by its time: 10:00 is a third of the way from 9:30 to 11:00');
  assert.equal(chart.times, undefined, 'no times along the bottom');
  assert.equal(chart.valueTicks, undefined, 'no values down the side');
});

test('1M, 3M and 1Y place points by time, so the $0 before the account shows; 1W and ALL space them evenly', t => {
  const points = [{ at: NOW - 30 * DAY, value: 0 }, { at: NOW - 3 * DAY - 1, value: 0 }, { at: NOW - 3 * DAY, value: 25000 }, { at: NOW, value: 25010 }];
  const { chart } = chartWith(t, points, { start: NOW - 30 * DAY, end: NOW, fromOpening: false }, '1M');
  assert.ok(chart.placed()[2].x > 700, 'the deposit three days ago is near the right edge');
  assert.equal(chart.tone(), 'up', 'measured from the first deposit, not from $0');
  assert.equal(chart.baselineY(), chart.placed()[2].y, 'the dotted line at the first funded value');
  assert.ok(chart.summary().includes('from $25000.00 to $25010.00'));
  // A week of three sessions' values, with nights in between.
  const week = [0, 1, 2, 24, 25, 26, 48, 49, 50].map((h, i) => ({ at: NOW - 50 * HOUR + h * HOUR, value: 1000 + i }));
  const { chart: even } = chartWith(t, week, { start: NOW - 7 * DAY, end: NOW, fromOpening: false }, '1W');
  assert.deepEqual(even.placed().map((p) => p.x), [0, 100, 200, 300, 400, 500, 600, 700, 800]);
});

test('the value scale leaves a little room around the line, and a band around a flat one', () => {
  const wide = valueScale([1000, 1100]);
  assert.ok(wide.low < 1000 && wide.high > 1100);
  const flat = valueScale([500, 500]);
  assert.ok(flat.low < 500 && flat.high > 500, 'a flat line still sits inside a band');
  assert.ok(valueScale([]).high > valueScale([]).low);
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
  chart.scrubKey(key('ArrowLeft'));
  assert.match(chart.cursorTime(), /^Oct 18, 10:00:00 PM CT$/, 'Central time, 12-hour clock, to the second within two days');
  chart.endScrub();
  assert.deepEqual(chart.placed().map((p) => p.x), [0, 400, 800], 'evenly spaced');
  chart.scrubKey(key('Home'));
  assert.equal(chart.labelLeft(), 8, 'the time label stays inside the chart at the left edge');
  chart.scrubKey(key('End'));
  assert.equal(chart.labelLeft(), 92);
  let picked = null;
  chart.periodChange.subscribe((p) => { picked = p; });
  chart.periodChange.emit('1M');
  assert.equal(picked, '1M');
});

test('the default day detail spreads recent activity across the chart without changing full-day performance', (t) => {
  const points = Array.from({ length: 241 }, (_, i) => ({
    at: NOW - 4 * HOUR + i * 60000,
    value: 5000 - i / 10,
  }));
  const original = structuredClone(points);
  const { chart } = chartWith(t, points, day);
  assert.equal(chart.focused(), true);
  assert.equal(chart.displayPoints().length, 61);
  assert.equal(chart.placed()[0].x, 0);
  assert.equal(chart.end().x, 800);
  assert.equal(chart.tone(), 'down');
  assert.match(chart.summary(), /from \$5000\.00/);
  chart.scrubKey({ key: 'Home', preventDefault() {} });
  assert.equal(chart.active().at, NOW - HOUR);
  const picked = [];
  chart.scrub.subscribe((p) => picked.push(p));
  chart.setDayView('full');
  assert.equal(chart.active(), null);
  assert.equal(picked.at(-1), null);
  assert.equal(chart.displayPoints().length, 241);
  assert.deepEqual(points, original);
  chart.setDayView('recent');
  assert.equal(chart.displayPoints().length, 61);
});

test('invalid observations cannot break the path before its endpoint; duplicate timestamps use the newest record', (t) => {
  const { chart } = chartWith(
    t,
    [
      { at: NOW, value: 5002 },
      { at: NOW - 60000, value: 5000 },
      { at: NOW - 50000, value: NaN },
      { at: NOW - 30000, value: Infinity },
      { at: NOW, value: 5001 },
      { at: NaN, value: 5003 },
    ],
    day,
  );
  assert.deepEqual(
    chart.history().map((p) => p.value),
    [5000, 5001],
  );
  assert.doesNotMatch(chart.path(), /NaN|Infinity/);
  assert.ok(chart.path().endsWith(`${chart.end().x},${Number(chart.end().y.toFixed(3))}`));
});


test('recent-hour updates shift existing timestamps left at a fixed scale',t=>{
  const points=Array.from({length:241},(_,i)=>({at:NOW-4*HOUR+i*60000,value:5000+i/10}));
  const {chart,inputs}=chartWith(t,points,day);
  const before=chart.placed().find(point=>point.at===NOW-HOUR/2).x;
  inputs.points.set([...points,{at:NOW+5000,value:5025}]);
  const after=chart.placed().find(point=>point.at===NOW-HOUR/2).x;
  assert.ok(Math.abs(before-after-800*5000/HOUR)<1e-9);
  assert.equal(chart.end().x,800);
  assert.equal(chart.history().length,242);
});
