import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
const { createLightweightChart, UP_COLOR, DOWN_COLOR, AREA_COLOR } = await import('../src/app/lightweight-chart.ts');
const { LiveChart, CHART_FACTORY } = await import('../src/app/live-chart.ts');

/** Records every call the adapter makes, standing in for lightweight-charts. */
function fakeLibrary() {
  const log = { added: [], removed: [], fits: 0, removedChart: false };
  const series = (type, options) => {
    const s = { type, options, data: null, applied: [], lines: [], removedLines: [],
      setData(d) { this.data = d; }, applyOptions(o) { this.applied.push(o); },
      createPriceLine(o) { this.lines.push(o); return o; }, removePriceLine(l) { this.removedLines.push(l); } };
    log.added.push(s);
    return s;
  };
  const lib = {
    AreaSeries: 'Area', CandlestickSeries: 'Candles', LineSeries: 'Line',
    LineStyle: { Dashed: 2 }, ColorType: { Solid: 'solid' }, CrosshairMode: { Normal: 0 },
    createChart(element, options) {
      log.element = element; log.options = options;
      return { addSeries: series, removeSeries: s => log.removed.push(s), timeScale: () => ({ fitContent: () => { log.fits++; } }),
        remove: () => { log.removedChart = true; } };
    },
    createSeriesMarkers(s) { return { setMarkers: m => { s.markers = m; } }; },
  };
  return { lib, log };
}

const candles = [{ time: 60, open: 1, high: 2, low: 0.5, close: 1.5 }];

test('draws candles with markers and an average-cost line, refitting only for a new window', () => {
  const { lib, log } = fakeLibrary();
  const element = {};
  const chart = createLightweightChart(lib, element);
  assert.equal(log.element, element);
  assert.equal(log.options.layout.background.type, 'solid');

  const marker = { time: 60, position: 'belowBar', shape: 'arrowUp', color: '#0f0', text: 'Buy 1 @ 1.00' };
  chart.render({ kind: 'candles', data: candles, key: 'AAPL-1D', markers: [marker],
    priceLines: [{ price: 1.2, color: '#fff', title: 'Avg cost' }] });
  const main = log.added[0];
  assert.equal(main.type, 'Candles');
  assert.equal(main.options.upColor, UP_COLOR);
  assert.equal(main.options.downColor, DOWN_COLOR);
  assert.deepEqual(main.data, candles);
  assert.deepEqual(main.markers, [marker]);
  assert.deepEqual(main.lines, [{ price: 1.2, color: '#fff', title: 'Avg cost', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }]);
  assert.equal(log.fits, 1);

  // A live update of the same window keeps the zoom and replaces the price line.
  chart.render({ kind: 'candles', data: candles, key: 'AAPL-1D', priceLines: [{ price: 1.3, color: '#fff', title: 'Avg cost' }] });
  assert.equal(log.added.length, 1);
  assert.equal(log.fits, 1);
  assert.equal(main.removedLines.length, 1);
  assert.deepEqual(main.markers, []);

  chart.render({ kind: 'candles', data: candles, key: 'MSFT-1D' });
  assert.equal(log.fits, 2);

  chart.destroy();
  assert.equal(log.removedChart, true);
});

test('switching kind rebuilds the series; overlays and a fixed range are applied', () => {
  const { lib, log } = fakeLibrary();
  const chart = createLightweightChart(lib, {});
  const points = [{ time: 60, value: 10 }];
  chart.render({ kind: 'area', data: points, overlays: [{ data: points, color: '#00f' }] });
  const [area, overlay] = log.added;
  assert.equal(area.type, 'Area');
  assert.equal(area.options.lineColor, AREA_COLOR);
  assert.equal(overlay.type, 'Line');
  assert.deepEqual(overlay.data, points);
  assert.equal(area.applied.at(-1).autoscaleInfoProvider, undefined);

  chart.render({ kind: 'line', data: points, color: '#abc', range: { min: 0, max: 100 } });
  assert.equal(log.removed.length, 2);
  assert.ok(log.removed.includes(area) && log.removed.includes(overlay));
  const line = log.added.at(-1);
  assert.equal(line.type, 'Line');
  assert.equal(line.options.color, '#abc');
  assert.deepEqual(line.applied.at(-1).autoscaleInfoProvider(), { priceRange: { minValue: 0, maxValue: 100 } });
});

test('the component creates one chart, redraws on new specs and destroys it with the view', async t => {
  const drawn = [];
  let created = 0;
  let destroyed = false;
  const factory = () => { created++; return { render: spec => drawn.push(spec), destroy: () => { destroyed = true; } }; };
  const fixture = await render(t, LiveChart, { spec: { kind: 'line', data: [] }, label: 'AAPL price' },
    [{ provide: CHART_FACTORY, useValue: factory }]);
  fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('.live-chart').getAttribute('aria-label'), 'AAPL price');
  assert.equal(created, 1);
  assert.equal(drawn.length, 1);

  fixture.componentRef.setInput('spec', { kind: 'line', data: [{ time: 1, value: 2 }] });
  fixture.detectChanges();
  assert.equal(created, 1);
  assert.deepEqual(drawn.at(-1).data, [{ time: 1, value: 2 }]);

  fixture.destroy();
  assert.equal(destroyed, true);
});
