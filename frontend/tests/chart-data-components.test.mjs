import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
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
