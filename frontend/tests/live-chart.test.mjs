import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
const { createLightweightChart, tooltipLines, UP_COLOR, DOWN_COLOR, AREA_COLOR } = await import('../src/app/lightweight-chart.ts');
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
        subscribeCrosshairMove: handler => { log.crosshair = handler; },
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

test('tooltip lines show open/high/low/close for candles, dollars for values and a plain number for RSI', () => {
  const minute = Date.UTC(2026, 9, 15, 14, 35) / 1000;
  const [when, high, low] = tooltipLines('candles', { time: minute, open: 225.1, high: 226.456, low: 224, close: 225.75 }, minute, 'money', 'en-US');
  assert.match(when, /^Oct 15, \d\d:\d\d/);
  assert.equal(high, 'O 225.10  H 226.46');
  assert.equal(low, 'L 224.00  C 225.75');
  assert.deepEqual(tooltipLines('area', { time: minute, value: 10250.5 }, minute, 'money', 'en-US').slice(1), ['$10,250.50']);
  assert.deepEqual(tooltipLines('line', { time: minute, value: 62.345 }, minute, 'number', 'en-US').slice(1), ['62.35']);
  const day = Date.UTC(2026, 9, 15) / 1000;
  assert.equal(tooltipLines('line', { time: day, value: 1 }, day, 'money', 'en-US')[0], 'Oct 15, 2026');
});

test('hovering a bar shows its values next to the pointer; moving off the data hides them', () => {
  const { lib, log } = fakeLibrary();
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  const chart = createLightweightChart(lib, element);
  const bar = { time: 60, open: 1, high: 2, low: 0.5, close: 1.5 };
  chart.render({ kind: 'candles', data: [bar], key: 'AAPL-1D' });
  const box = element.querySelector('.chart-tooltip');
  assert.equal(box.style.display, 'none');

  log.crosshair({ time: 60, point: { x: 40, y: 50 }, seriesData: new Map([[log.added[0], bar]]) });
  assert.equal(box.style.display, 'block');
  assert.match(box.textContent, /O 1\.00 {2}H 2\.00L 0\.50 {2}C 1\.50/);
  assert.equal(box.style.left, '52px');
  // Near the right edge the box flips to the left of the pointer so it stays inside the chart.
  log.crosshair({ time: 60, point: { x: 395, y: 50 }, seriesData: new Map([[log.added[0], bar]]) });
  assert.equal(box.style.left, '383px');

  log.crosshair({ time: undefined, point: undefined, seriesData: new Map() });
  assert.equal(box.style.display, 'none');
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
