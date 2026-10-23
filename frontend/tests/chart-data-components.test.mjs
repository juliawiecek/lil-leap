import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, animateFrame } from './dom-helper.mjs';
const { TechnicalChart } = await import('../src/app/technical-chart.ts');
const { PortfolioChart } = await import('../src/app/portfolio-chart.ts');
const start = Date.parse('2026-10-21T14:00:00Z');
const values = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
const bars = values.map((price, i) => ({ at: start + i * 60000, price,
  candle: { time: start + i * 60000, open: price, high: price, low: price, close: price, volume: null } }));

test('rendered RSI, reusable series and chart alternatives share the same real observations', async t => {
  const fixture = await render(t, TechnicalChart, { points: bars, window: { start, end: bars.at(-1).at }, symbol: 'AAPL' });
  const chart = fixture.componentInstance;
  const series = chart.chartSeries().find(s => s.id === 'AAPL:rsi');
  assert.ok(Math.abs(series.points[0].value - 70.46413502109705) < 1e-10);
  assert.equal(series.points[0].time, bars[14].at);
  assert.equal(fixture.nativeElement.querySelector('.rsi-plot path').getAttribute('d'), chart.rsiLine());
  assert.match(chart.rsiTable().rows[0][1], /70\.464135/);
  assert.equal(chart.chartSeries().find(s => s.id.endsWith(':volume')).status, 'unavailable');
  fixture.componentRef.setInput('points', bars.slice(0, 3));
  fixture.componentRef.setInput('symbol', 'MSFT');
  fixture.componentRef.setInput('chartKey', 'MSFT:1W');
  fixture.detectChanges();
  assert.equal(chart.chartSeries().find(s => s.id === 'MSFT:rsi').status, 'unavailable');
  assert.equal(fixture.nativeElement.querySelector('.rsi-plot'), null);
  assert.deepEqual(chart.dataTable().rows.map(r => r[4]), values.slice(0, 3).map(String));
});

test('mixed OHLC and raw quotes render and inspect the same source', async t => {
  const points = [...bars.slice(0, 2), { at: start + 120000, price: 45 }];
  const fixture = await render(t, TechnicalChart, { points, window: { start, end: start + 120000 } });
  const chart = fixture.componentInstance;
  assert.equal(chart.candles().length, 2);
  assert.ok(fixture.nativeElement.querySelector('.price-line').getAttribute('d'));
  assert.deepEqual(chart.rawTail().map(p => p.at), [points[1].at, points[2].at], 'raw ticks continue the last candle without redrawing its history');
  chart.inspectKey({ key: 'End', preventDefault() {} }); fixture.detectChanges();
  assert.equal(chart.inspected().price, 45);
  assert.equal(chart.inspected().candle, undefined);
  assert.equal(chart.allData().rows.at(-1)[1], 'Unavailable');
  assert.equal(chart.allData().rows.at(-1)[4], '45');
  fixture.componentRef.setInput('points', []); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('.price-axis').textContent.trim(), '');
});

test('raw price charts keep inspection usable without fabricating candles', async t => {
  const points = bars.slice(0, 3).map(({ at, price }) => ({ at, price }));
  const fixture = await render(t, TechnicalChart, { points, window: { start, end: points.at(-1).at } });
  const chart = fixture.componentInstance;
  assert.deepEqual(chart.candles(), []);
  chart.inspectKey({ key: 'Home', preventDefault() {} }); fixture.detectChanges();
  assert.equal(chart.inspected().price, values[0]);
  assert.match(fixture.nativeElement.querySelector('.candle-detail').textContent, /44\.34/);
});

test('portfolio series exposes loading/error states and shares the normalized rendered source', async t => {
  const fixture = await render(t, PortfolioChart, { points: [{ at: start + 1, value: 2 }, { at: start, value: 1 }, { at: start, value: 3 }],
    period: 'ALL', range: { start, end: start + 1 }, accountKey: 'one' });
  const chart = fixture.componentInstance;
  assert.deepEqual(chart.chartSeries().points, [{ time: start, value: 3 }, { time: start + 1, value: 2 }]);
  assert.deepEqual(chart.history().map(p => p.value), [3, 2]);
  fixture.componentRef.setInput('loading', true); fixture.detectChanges();
  assert.equal(chart.chartSeries().status, 'loading'); assert.deepEqual(chart.chartSeries().points, []);
  fixture.componentRef.setInput('loading', false); fixture.componentRef.setInput('error', 'Offline'); fixture.detectChanges();
  assert.equal(chart.chartSeries().status, 'error'); assert.deepEqual(chart.chartSeries().points, []);
  assert.match(fixture.nativeElement.textContent, /Offline/);
});

test('dense portfolio SVG, tooltips and accessible series share exact retained observations', async t => {
  const points = Array.from({ length: 500 }, (_, i) => ({ at: start + i * 1000, value: 10000 + i % 11 }));
  points[100] = { at: start + 100000, value: 9950 };
  points[400] = { at: start + 400000, value: 10050 };
  const fixture = await render(t, PortfolioChart, { points, period: 'ALL', range: { start, end: points.at(-1).at } });
  const chart = fixture.componentInstance;
  animateFrame(performance.now() + 1000);
  fixture.detectChanges();
  assert.ok(chart.plotPoints().length < points.length);
  assert.equal(chart.allData().rows.length, points.length);
  assert.equal(fixture.nativeElement.querySelector('.line').getAttribute('d'), chart.path());
  assert.ok(chart.chartSeries().points.every(p => points.some(source => source.at === p.time && source.value === p.value)));
  const seen = [];
  chart.scrub.subscribe(p => { if (p) seen.push(p); });
  chart.scrubKey({ key: 'Home', preventDefault() {} });
  chart.scrubKey({ key: 'End', preventDefault() {} });
  assert.deepEqual(seen.map(p => [p.at, p.value]), [[points[0].at, points[0].value], [points.at(-1).at, points.at(-1).value]]);
});

test('a truncated year advertises partial coverage in visible and shared chart data', async t => {
  const points = [{ at: start - 86400000, value: 100 }, { at: start, value: 110 }];
  const range = { start: start - 365 * 86400000, end: start, fromOpening: false };
  const fixture = await render(t, PortfolioChart, { points, period: '1Y', range });
  const chart = fixture.componentInstance;
  assert.equal(chart.chartSeries().coverage.status, 'partial');
  assert.equal(chart.chartSeries().coverage.requestedStart, range.start);
  assert.equal(chart.chartSeries().coverage.start, points[0].at);
  assert.match(fixture.nativeElement.textContent, /Partial history/);
  assert.match(chart.description(), /available recorded history/);
  assert.doesNotMatch(chart.summary(), /past 365 days/);
  assert.match(fixture.nativeElement.querySelector('.recorded-range').textContent, /2026/);
  fixture.componentRef.setInput('points', [{ at: start - 60000, value: 100 }, { at: start, value: 110 }]);
  fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.recorded-range').textContent, /2026/, 'a short recorded span in a year view still names its date');
});
