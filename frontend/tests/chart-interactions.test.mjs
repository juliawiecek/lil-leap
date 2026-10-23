import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLATFORM_ID } from '@angular/core';
import { Subject } from 'rxjs';
import { browser, render, animateFrame } from './dom-helper.mjs';
const { StockSvgChart } = await import('../src/app/stock-svg-chart.ts');
const { PortfolioChart } = await import('../src/app/portfolio-chart.ts');
const { RealtimeStockChart } = await import('../src/app/realtime-stock-chart.ts');
const { STOCK_PRICE_TICKS } = await import('../src/app/stock-price-ticks.ts');

function environment(t) {
  const bounds = { width: 600, height: 320, left: 0, top: 0 };
  t.mock.method(browser.SVGElement.prototype, 'getBoundingClientRect', () => bounds);
  const motion = Object.assign(new browser.EventTarget(), { matches: false });
  t.mock.method(browser, 'matchMedia', () => motion);
  const observers = [];
  t.mock.method(browser, 'ResizeObserver', function (callback) {
    const observer = {
      callback,
      disconnected: false,
      observe(element) {
        this.element = element;
      },
      disconnect() {
        this.disconnected = true;
      },
    };
    observers.push(observer);
    return observer;
  });
  return { bounds, motion, observers };
}

test('SVG touch inspection, keyboard navigation, resize and reduced motion retain real observations', async (t) => {
  const env = environment(t);
  const fixture = await render(t, StockSvgChart);
  const chart = fixture.componentInstance;
  chart.setHistory([
    { time: 100, price: 100 },
    { time: 160, price: 110 },
  ]);
  fixture.detectChanges();
  const svg = fixture.nativeElement.querySelector('svg');
  const tooltip = fixture.nativeElement.querySelector('.tooltip');
  const line = svg.querySelector('[data-line]');
  fixture.componentRef.setInput('windowSeconds', 3600);
  fixture.detectChanges();
  assert.match(chart.description(), /last 3600 seconds/);
  const capture = t.mock.method(svg, 'setPointerCapture', (id) => id);
  svg.dispatchEvent(
    new browser.PointerEvent('pointerdown', { clientX: 16, pointerType: 'touch', pointerId: 7 }),
  );
  assert.equal(capture.mock.calls[0].arguments[0], 7);
  assert.match(tooltip.textContent, /100\.00/);
  assert.equal(tooltip.hidden, false);
  const inspected = line.getAttribute('d');
  chart.append({ time: 165, price: 105 });
  animateFrame(performance.now() + 1000);
  assert.equal(line.getAttribute('d'), inspected);
  env.bounds.width = 800;
  env.observers[0].callback();
  env.observers[0].callback();
  animateFrame(performance.now() + 1000);
  assert.match(tooltip.textContent, /100\.00/);
  assert.equal(svg.querySelector('linearGradient').getAttribute('y2'), '290');
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  assert.match(tooltip.textContent, /110\.00/);
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'End' }));
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Tab' }));
  svg.dispatchEvent(new browser.PointerEvent('pointerup'));
  animateFrame(performance.now() + 1000);
  assert.equal(tooltip.hidden, true);
  chart.append({ time: 170, price: 120 });
  animateFrame(performance.now() + 100);
  assert.equal(svg.querySelector('[data-latest]').getAttribute('visibility'), 'hidden');
  env.motion.matches = true;
  env.motion.dispatchEvent(new browser.Event('change'));
  assert.equal(svg.querySelector('[data-latest]').getAttribute('visibility'), 'visible');
  env.motion.matches = false;
  env.motion.dispatchEvent(new browser.Event('change'));
  svg.dispatchEvent(new browser.PointerEvent('pointermove', { clientX: 400 }));
  assert.equal(tooltip.hidden, false);
  svg.dispatchEvent(new browser.PointerEvent('pointerleave'));
  chart.setPerformance(120, 100);
  assert.deepEqual(chart.dataTable().references, [{ label: 'Session open', value: '$100.00' }]);
  chart.setHistory([]);
  fixture.detectChanges();
  assert.deepEqual(chart.dataTable().references, [], 'clearing a security must remove its opening-price reference');
  assert.equal(chart.performance(), 'neutral');
  svg.dispatchEvent(new browser.PointerEvent('pointermove', { clientX: 16 }));
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  assert.equal(line.getAttribute('d'), '');
  assert.equal(tooltip.hidden, true);
  env.bounds.width = 0;
  chart.setHistory([{ time: 200, price: 130 }]);
  assert.equal(line.getAttribute('d'), '');
  env.bounds.width = 600;
  env.observers[0].callback();
  animateFrame(performance.now() + 1000);
  assert.match(line.getAttribute('d'), /^M/);
  env.observers[0].callback();
  fixture.destroy();
  assert.equal(env.observers[0].disconnected, true);
  animateFrame(performance.now() + 1000);
});

test('stock chart skips browser observers during server rendering', async (t) => {
  const env = environment(t);
  const fixture = await render(t, StockSvgChart, {}, [
    { provide: PLATFORM_ID, useValue: 'server' },
  ]);
  assert.equal(env.observers.length, 0);
  assert.equal(fixture.nativeElement.querySelector('[data-line]').getAttribute('d'), null);
});

test('portfolio loading hides the old plot and values until its new period is ready', async t => {
  environment(t);
  const at = Date.parse('2026-10-21T14:00:00Z');
  const fixture = await render(t, PortfolioChart, { points: [{ at, value: 100 }, { at: at + 1000, value: 110 }] });
  assert.ok(fixture.nativeElement.querySelector('svg'));
  fixture.componentRef.setInput('loading', true);
  fixture.componentRef.setInput('period', '1W'); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('svg[role="img"]'), null);
  assert.match(fixture.componentInstance.description(), /loading/);
  assert.deepEqual(fixture.componentInstance.dataTable().rows, []);
  fixture.componentRef.setInput('points', [{ at, value: 200 }, { at: at + 1000, value: 220 }]);
  fixture.componentRef.setInput('loading', false); fixture.detectChanges();
  assert.ok(fixture.nativeElement.querySelector('svg'));
  assert.match(fixture.componentInstance.description(), /\$200\.00.*\$220\.00/);
  assert.deepEqual(fixture.componentInstance.dataTable().rows.map(row => row[1]), ['$200.00', '$220.00']);
});

test('recent-hour alternatives retain the drawn full-period baseline and redact it with hidden balances', async t => {
  environment(t);
  const at = Date.parse('2026-10-21T14:00:00Z');
  const fixture = await render(t, PortfolioChart, { points: [{ at, value: 100 }, { at: at + 5400000, value: 110 }, { at: at + 7200000, value: 120 }] });
  const chart = fixture.componentInstance;
  assert.equal(chart.dataTable().rows.length, 2, 'only the recent hour is displayed');
  assert.deepEqual(chart.dataTable().references, [{ label: 'Period starting value reference', value: '$100.00' }]);
  assert.match(chart.description(), /from \$110\.00.*\$120\.00.*reference line.*\$100\.00/);
  fixture.componentRef.setInput('balanceHidden', true); fixture.detectChanges();
  assert.deepEqual(chart.dataTable().references, []);
  assert.doesNotMatch(chart.description(), /100|110|120/);
});

test('realtime wrapper seeds history, changes its sample clock and rejects older live observations', async (t) => {
  environment(t);
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const feed = new Subject();
  const fixture = await render(
    t,
    RealtimeStockChart,
    {
      history: [
        { time: 100, price: 100 },
        { time: 160, price: 110 },
      ],
      openingPrice: 100,
    },
    [{ provide: STOCK_PRICE_TICKS, useValue: feed }],
  );
  const line = fixture.nativeElement.querySelector('[data-line]');
  const original = line.getAttribute('d');
  assert.match(original, /^M.+C/);
  feed.next({ time: 150, price: 999 });
  t.mock.timers.tick(5000);
  assert.equal(line.getAttribute('d'), original);
  fixture.componentRef.setInput('sampleMs', 10000);
  fixture.componentRef.setInput('history', [
    { time: 200, price: 90 },
    { time: 260, price: 95 },
  ]);
  fixture.detectChanges();
  const updated = line.getAttribute('d');
  const svg = fixture.nativeElement.querySelector('svg');
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  assert.match(fixture.nativeElement.querySelector('.tooltip').textContent, /90\.00/);
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape' }));
  feed.next({ time: 265, price: 98 });
  t.mock.timers.tick(9999);
  assert.equal(line.getAttribute('d'), updated);
  t.mock.timers.tick(1);
  animateFrame(performance.now() + 1000);
  assert.notEqual(line.getAttribute('d'), updated);
  fixture.destroy();
  assert.equal(feed.observed, false);
});

test('portfolio SVG renders and animates history, changes periods, scrubs and clears safely', async (t) => {
  const env = environment(t);
  const now = Date.parse('2026-10-20T17:00:00Z');
  const points = [
    { at: now - 7200000, value: 100 },
    { at: now - 1800000, value: 110 },
    { at: now, value: 105 },
  ];
  const fixture = await render(t, PortfolioChart, { points });
  const chart = fixture.componentInstance;
  fixture.detectChanges();
  const svg = fixture.nativeElement.querySelector('svg');
  const line = svg.querySelector('.line');
  assert.match(line.getAttribute('d'), /^M.+C/);
  assert.match(chart.areaPath(), /Z$/);
  fixture.componentRef.setInput('points', [...points, { at: now + 5000, value: 120 }]);
  fixture.detectChanges();
  animateFrame(performance.now() + 100);
  assert.match(line.getAttribute('d'), /^M.+C/);
  env.motion.matches = true;
  env.motion.dispatchEvent(new browser.Event('change'));
  assert.ok(svg.querySelector('.area').getAttribute('d').startsWith(line.getAttribute('d')));
  assert.match(svg.querySelector('.endpoint').getAttribute('d'), /l0,0$/);
  env.motion.matches = false;
  env.motion.dispatchEvent(new browser.Event('change'));
  chart.setDayView('full');
  fixture.detectChanges();
  fixture.componentRef.setInput('period', 'ALL');
  fixture.componentRef.setInput('range', { start: now - 7200000, end: now, fromOpening: true });
  fixture.detectChanges();
  assert.match(chart.openedText(), /CT$/);
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  fixture.detectChanges();
  assert.equal(chart.active().value, 100);
  assert.match(chart.cursorTime(), /CT$/);
  assert.ok(chart.labelLeft() > 0);
  svg.dispatchEvent(new browser.PointerEvent('pointermove', { clientX: 300 }));
  fixture.detectChanges();
  assert.ok(chart.active());
  chart.endScrub();
  fixture.componentRef.setInput('points', [
    { at: now - 3 * 86400000, value: 100 },
    { at: now, value: 100 },
  ]);
  fixture.detectChanges();
  assert.match(chart.summary(), /unchanged/);
  chart.scrubKey(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  assert.match(chart.cursorTime(), /2026/);
  fixture.componentRef.setInput('points', []);
  fixture.componentRef.setInput('range', null);
  chart.endScrub();
  fixture.detectChanges();
  assert.equal(chart.areaPath(), '');
  assert.equal(chart.cursorTime(), '');
  assert.equal(chart.openedText(), '');
  assert.equal(chart.baselineY(), 100);
  assert.equal(chart.end().value, 0);
  assert.equal(chart.labelLeft(), 0);
  assert.equal(fixture.nativeElement.querySelector('svg[role="img"]'), null);
  const scrubbed = [];
  chart.scrub.subscribe((point) => scrubbed.push(point));
  chart.scrubKey(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  assert.equal(chart.active(), null, 'an empty chart has no point to inspect');
  assert.deepEqual(scrubbed, []);
});

test('portfolio updates have one animation owner and inspection buffers new points without moving history', async (t) => {
  environment(t);
  const now = Date.parse('2026-10-20T21:30:00Z');
  const points = Array.from({ length: 121 }, (_, i) => ({
    at: now - 7200000 + i * 60000,
    value: 5000 + Math.sin(i) * 2,
  }));
  const fixture = await render(t, PortfolioChart, { points });
  const chart = fixture.componentInstance;
  const svg = fixture.nativeElement.querySelector('svg');
  const line = svg.querySelector('.line');
  const area = svg.querySelector('.area');
  const original = line.getAttribute('d');
  fixture.componentRef.setInput('points', [...points, { at: now + 5000, value: 5001 }]);
  fixture.detectChanges();
  // The new point is clipped at the old viewport until animation advances; Angular must
  // not overwrite that frame with the completed target coordinates.
  const origin = line.getAttribute('d');
  assert.notEqual(origin, chart.path());
  fixture.detectChanges();
  assert.equal(line.getAttribute('d'), origin);
  animateFrame(performance.now() + 1000);
  const completed = line.getAttribute('d');
  assert.notEqual(completed, original);
  assert.ok(area.getAttribute('d').startsWith(completed));
  const endpoint = svg.querySelector('.endpoint').getAttribute('d').match(/^M([\d.]+),([\d.]+) l0,0$/);
  assert.equal(Number(endpoint[1]), 800);
  assert.ok(Math.abs(Number(endpoint[2]) - chart.end().y) < 1e-9);
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  fixture.detectChanges();
  animateFrame(performance.now() + 1000);
  const inspected = line.getAttribute('d');
  const selected = { ...chart.active() };
  fixture.componentRef.setInput('points', [...points, { at: now + 5000, value: 5001 }, { at: now + 10000, value: 5010 }]);
  fixture.detectChanges();
  animateFrame(performance.now() + 1000);
  assert.equal(line.getAttribute('d'), inspected);
  assert.deepEqual(chart.active(), selected);
  svg.dispatchEvent(new browser.PointerEvent('pointerleave'));
  fixture.detectChanges();
  animateFrame(performance.now() + 1000);
  assert.equal(chart.active(), null);
  assert.equal(chart.history().at(-1).at, now + 10000);
  assert.notEqual(line.getAttribute('d'), inspected);
  assert.ok(area.getAttribute('d').startsWith(line.getAttribute('d')));
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  fixture.detectChanges();
  fixture.componentRef.setInput('period', '1W');
  fixture.componentRef.setInput('points', [{ at: now - 86400000, value: 1000 }, { at: now, value: 1100 }]);
  fixture.detectChanges();
  assert.equal(chart.active(), null, 'changing periods ends inspection of the previous history');
  assert.equal(chart.history().at(-1).value, 1100);
});
