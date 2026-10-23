import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, render, animateFrame } from './dom-helper.mjs';
import { withAudioContext } from './fake-audio.mjs';
const {
  chartCommand, chartSound, livePricesPaused, pageSize, pointAnnouncement, pointDate, stepIndex, tradeWords, tradesAt,
} = await import('../src/app/chart-keyboard.ts');
const { PortfolioChart } = await import('../src/app/portfolio-chart.ts');
const { StockSvgChart } = await import('../src/app/stock-svg-chart.ts');
const { TechnicalChart } = await import('../src/app/technical-chart.ts');
const { ChartAccess } = await import('../src/app/chart-access.ts');
const { ChartVoice } = await import('../src/app/chart-voice.ts');
const { AccessibilityStore } = await import('../src/app/accessibility.ts');
const { KEYBOARD_SHORTCUTS } = await import('../src/app/keyboard-shortcuts.ts');

const DAY = 24 * 60 * 60 * 1000;
/** 14:30 UTC on the given October 2026 day: 10:30 AM in New York, 9:30 AM in Chicago. */
const oct = (day) => Date.parse(`2026-10-${String(day).padStart(2, '0')}T14:30:00Z`);
const key = (k, extra = {}) => new browser.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });

test('arrow, Home/End and PageUp/PageDown keys move one point, to the ends, or a tenth (PS-26)', () => {
  assert.equal(pageSize(100), 10);
  assert.equal(pageSize(21), 2);
  assert.equal(pageSize(3), 1, 'short charts still move');
  assert.equal(stepIndex('ArrowRight', -1, 20), 19, 'nothing selected yet starts at the latest point');
  assert.equal(stepIndex('ArrowLeft', -1, 20), 18);
  assert.equal(stepIndex('ArrowRight', 5, 20), 6);
  assert.equal(stepIndex('ArrowLeft', 0, 20), 0, 'held at the start');
  assert.equal(stepIndex('Home', 7, 20), 0);
  assert.equal(stepIndex('End', 7, 20), 19);
  assert.equal(stepIndex('PageDown', 19, 20), 17, 'PageDown goes a tenth earlier');
  assert.equal(stepIndex('PageUp', 3, 20), 5, 'PageUp goes a tenth later, as on a slider');
  assert.equal(stepIndex('PageUp', 19, 20), 19);
  assert.equal(stepIndex('PageDown', 1, 20), 0);
  assert.equal(stepIndex('PageDown', 50, 20), 17, 'an index past the end counts as the latest');
  assert.equal(stepIndex('a', 3, 20), null);
  assert.equal(stepIndex('ArrowRight', -1, 0), null, 'no points, no move');
});

test('D, T and Space are chart commands only without Ctrl, Alt or Cmd, and never on key repeat', () => {
  const press = (k, extra = {}) => ({ key: k, code: '', ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...extra });
  assert.equal(chartCommand(press('d')), 'summary');
  assert.equal(chartCommand(press('D', { shiftKey: true })), 'summary', 'caps lock or Shift still works');
  assert.equal(chartCommand(press('t')), 'table');
  assert.equal(chartCommand(press(' ')), 'sound');
  assert.equal(chartCommand(press('Spacebar', { code: 'Space' })), 'sound');
  assert.equal(chartCommand(press(' ', { altKey: true, shiftKey: true, code: 'Space' })), null, 'Alt + Shift + Space pauses speech instead');
  assert.equal(chartCommand(press('d', { ctrlKey: true })), null);
  assert.equal(chartCommand(press('t', { metaKey: true })), null);
  assert.equal(chartCommand(press(' ', { repeat: true })), null, 'holding Space does not stutter play/stop');
  assert.equal(chartCommand(press('x')), null);
});

test('each point is said as date, value and change from the point before', () => {
  const daily = [{ at: oct(13), value: 180.2 }, { at: oct(14), value: 182.4 }, { at: oct(15), value: 182.4 }, { at: oct(16), value: 0 }];
  assert.equal(pointAnnouncement(daily, 1), 'Oct 14, $182.40, up 1.22 percent.');
  assert.equal(pointAnnouncement(daily, 0), 'Oct 13, $180.20, first point.');
  assert.equal(pointAnnouncement(daily, 2), 'Oct 15, $182.40, unchanged.');
  assert.equal(pointAnnouncement(daily, 3), 'Oct 16, $0.00, down 100.00 percent. Latest point.');
  assert.equal(pointAnnouncement(daily, 9), '', 'no point, nothing said');
  assert.equal(pointAnnouncement(daily, 1, { hidden: true }), 'Oct 14, up 1.22 percent.', 'hidden balances say no amounts');
  assert.equal(pointAnnouncement(daily, 1, { currency: 'EUR' }), 'Oct 14, €182.40, up 1.22 percent.');
  assert.equal(pointAnnouncement(daily, 1, { detail: 'Up bar.' }), 'Oct 14, $182.40, up 1.22 percent. Up bar.');
  const funded = [{ at: oct(13), value: 0 }, { at: oct(14), value: 0 }, { at: oct(16), value: 500 }];
  assert.equal(pointAnnouncement(funded, 1), 'Oct 14, $0.00, unchanged.');
  assert.equal(pointAnnouncement(funded, 2), 'Oct 16, $500.00, up from $0.00. Latest point.', 'no percent from zero');
  assert.equal(pointAnnouncement(funded, 2, { hidden: true }), 'Oct 16, up from zero. Latest point.');
  assert.equal(pointAnnouncement([{ at: oct(14), value: 0 }, { at: oct(20), value: -5 }], 1), 'Oct 20, -$5.00, down from $0.00. Latest point.');
});

test('the date says the time on short charts, seconds for close points, and the year when it differs', () => {
  const minutes = [{ at: oct(14), value: 1 }, { at: oct(14) + 5 * 60000, value: 2 }];
  assert.equal(pointDate(minutes, 1), 'Oct 14, 10:35 AM', 'New York time by default');
  assert.equal(pointDate(minutes, 1, 'America/Chicago'), 'Oct 14, 9:35 AM');
  const ticks = [{ at: oct(14), value: 1 }, { at: oct(14) + 5000, value: 2 }];
  assert.equal(pointDate(ticks, 0), 'Oct 14, 10:30:00 AM');
  const years = [{ at: Date.parse('2025-12-30T15:00:00Z'), value: 1 }, { at: oct(14), value: 2 }];
  assert.equal(pointDate(years, 0), 'Dec 30, 2025');
  assert.equal(pointDate(years, 1), 'Oct 14');
});

test('a trade is said at the point nearest it, with the company, unless trades are private', () => {
  const points = [{ at: oct(13), value: 10 }, { at: oct(14), value: 11 }, { at: oct(15), value: 12 }, { at: oct(19), value: 12 }];
  const buy ={ side: 'BUY', quantity: 2, price: 10.5, at: oct(14) - 2 * 3600000 };
  const sell = { side: 'SELL', quantity: 1, price: 12, at: oct(15), symbol: 'AAPL' };
  const early = { side: 'BUY', quantity: 1, price: 9, at: oct(12) };
  assert.deepEqual(tradesAt(points, 1, [buy, sell, early]), [buy]);
  assert.deepEqual(tradesAt(points, 0, [buy, early]), [], 'a trade before the chart starts is not on it');
  assert.deepEqual(tradesAt([], 0, [buy]), []);
  assert.equal(tradeWords([buy], { company: 'Microsoft' }), 'You bought 2 shares of Microsoft here at $10.50.');
  assert.equal(tradeWords([sell], { company: 'Microsoft' }), 'You sold 1 share of Apple here at $12.00.', 'a trade\'s own symbol wins');
  assert.equal(tradeWords([{ ...sell, symbol: 'ZZZQ' }]), 'You sold 1 share of ZZZQ here at $12.00.', 'unknown symbols are said as they are');
  assert.equal(tradeWords([buy]), 'You bought 2 shares here at $10.50.');
  assert.equal(tradeWords([buy], { tradesHidden: true }), '');
  assert.equal(pointAnnouncement(points, 1, { trades: [buy], company: 'Apple' }), 'Oct 14, $11.00, up 10.00 percent. You bought 2 shares of Apple here at $10.50.');
  assert.equal(pointAnnouncement(points, 1, { trades: [buy], hidden: true }), 'Oct 14, up 10.00 percent.');
});

test('the chart sound keeps trades inside the chart as buy and sell clicks, and a real average cost', () => {
  const points = [{ at: oct(13), value: 10 }, { at: oct(15), value: 12 }];
  const sound = chartSound(points, [
    { side: 'BUY', quantity: 1, price: 10, at: oct(14) }, { side: 'SELL', quantity: 1, price: 12, at: oct(15) }, { side: 'BUY', quantity: 1, price: 9, at: oct(1) },
  ], 11);
  assert.deepEqual(sound.points, [{ time: oct(13), value: 10 }, { time: oct(15), value: 12 }]);
  assert.deepEqual(sound.markers, [{ time: oct(14), side: 'buy' }, { time: oct(15), side: 'sell' }]);
  assert.equal(sound.averageCost, 11);
  assert.equal(chartSound(points, [], Number.NaN).averageCost, null);
  assert.equal(chartSound(points, [], 0).averageCost, null);
  assert.deepEqual(chartSound([]), { points: [], markers: [], averageCost: null });
});

test('Pause live updates is read from the livePrices setting and defaults to not paused', () => {
  assert.equal(livePricesPaused(undefined), false);
  assert.equal(livePricesPaused(null), false);
  assert.equal(livePricesPaused('paused'), false);
  assert.equal(livePricesPaused({ paused: 'yes' }), false);
  assert.equal(livePricesPaused({ paused: true }), true);
});

test('the Keyboard Shortcuts list names the chart keys', () => {
  const action = (k) => KEYBOARD_SHORTCUTS.find((s) => s.keys.includes(k))?.action ?? '';
  assert.match(action('Page Up'), /focused chart.*tenth/);
  assert.match(KEYBOARD_SHORTCUTS.find((s) => s.keys.includes('Page Up')).keys.join(), /Page Down/);
  assert.match(action('D'), /focused chart.*summary/);
  assert.match(action('T'), /focused chart.*table/);
  assert.ok(KEYBOARD_SHORTCUTS.some((s) => s.keys.includes('Space') && /focused chart.*sound.*again to stop/.test(s.action)));
  assert.equal(new Set(KEYBOARD_SHORTCUTS.map((s) => s.action)).size, KEYBOARD_SHORTCUTS.length, 'the dialog tracks rows by action');
});

test('saying the same thing twice is still announced', async (t) => {
  const fixture = await render(t, ChartAccess, { id: 'repeat', label: 'Prices', summary: 'Prices rose.', table: { columns: ['Time'], rows: [] } },
    [{ provide: ChartVoice, useValue: { stop() {}, speak() {} } }]);
  const access = fixture.componentInstance;
  access.announce('Oct 14, $1.00, first point.');
  const first = access.announcement();
  access.announce('Oct 14, $1.00, first point.');
  assert.notEqual(access.announcement(), first);
  assert.equal(access.announcement().trim(), first);
});

function environment(t) {
  const bounds = { width: 600, height: 320, left: 0, top: 0 };
  t.mock.method(browser.SVGElement.prototype, 'getBoundingClientRect', () => bounds);
  t.mock.method(browser, 'matchMedia', () => Object.assign(new browser.EventTarget(), { matches: false }));
  t.mock.method(browser, 'ResizeObserver', function () {
    return { observe() {}, disconnect() {} };
  });
}

/** The chart's polite live region and what it says now. */
function liveText(fixture, which = 0) {
  fixture.detectChanges();
  const region = fixture.nativeElement.querySelectorAll('app-chart-access [role="status"][aria-live="polite"]')[which];
  return region.textContent.replace(/ /g, '').trim();
}

const PORTFOLIO = Array.from({ length: 21 }, (_, i) => ({ at: oct(1) + i * DAY, value: 1000 + i * 10 }));

test('the novice portfolio chart announces each step, its fills, the summary and the table from the keyboard', async (t) => {
  environment(t);
  const fills = [{ at: oct(5) + 3600000, symbol: 'AAPL', quantity: 2, price: 227.4 }, { at: oct(18), symbol: 'MSFT', quantity: -1, price: 410 }];
  const fixture = await render(t, PortfolioChart, { points: PORTFOLIO, period: '1M', fills });
  const svg = fixture.nativeElement.querySelector('svg[role="img"]');
  svg.focus?.();
  svg.dispatchEvent(new browser.FocusEvent('focus'));
  const heard = [];
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'PageDown', 'End', 'Home']) {
    const event = key(k);
    svg.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, `${k} does not scroll the page`);
    heard.push(liveText(fixture));
  }
  assert.equal(heard[0], 'Oct 21, $1,200.00, up 0.84 percent. Latest point.');
  assert.equal(heard[2].trim(), heard[0], 'Right on the last point repeats it');
  assert.equal(heard[3], 'Oct 19, $1,180.00, up 0.85 percent.', 'PageDown moves 2 of 21 points back');
  assert.equal(heard[5], 'Oct 1, $1,000.00, first point.');
  for (let i = 0; i < 4; i++) svg.dispatchEvent(key('ArrowRight'));
  assert.equal(liveText(fixture), 'Oct 5, $1,040.00, up 0.97 percent. You bought 2 shares of Apple here at $227.40.');
  svg.dispatchEvent(key('End'));
  for (let i = 0; i < 3; i++) svg.dispatchEvent(key('ArrowLeft'));
  assert.match(liveText(fixture), /^Oct 18, .*You sold 1 share of Microsoft here at \$410\.00\.$/);
  assert.equal(fixture.nativeElement.querySelector('.cursor-time') !== null, true, 'the cursor is drawn where it is said');

  const buttons = [...fixture.nativeElement.querySelectorAll('app-chart-access button')];
  const explain = buttons.find((b) => b.textContent.includes('Explain this chart'));
  const table = buttons.find((b) => b.textContent.includes('Show as table'));
  svg.dispatchEvent(key('d'));
  fixture.detectChanges();
  assert.equal(explain.getAttribute('aria-expanded'), 'true');
  assert.equal(liveText(fixture), fixture.componentInstance.description().trim());
  svg.dispatchEvent(key('d'));
  fixture.detectChanges();
  assert.equal(explain.getAttribute('aria-expanded'), 'true', 'D reads again rather than closing the explanation');
  assert.equal(liveText(fixture), fixture.componentInstance.description().trim());
  const before = browser.document.activeElement;
  svg.dispatchEvent(key('t'));
  fixture.detectChanges();
  assert.equal(table.getAttribute('aria-expanded'), 'true');
  assert.ok(fixture.nativeElement.querySelector('table'));
  assert.equal(liveText(fixture), 'Portfolio value data table shown after the chart.');
  assert.equal(browser.document.activeElement, before, 'focus stays on the chart');
  svg.dispatchEvent(key('T'));
  fixture.detectChanges();
  assert.equal(table.getAttribute('aria-expanded'), 'false');
  assert.equal(liveText(fixture), 'Portfolio value data table hidden.');
  const ctrl = key('d', { ctrlKey: true });
  svg.dispatchEvent(ctrl);
  assert.equal(ctrl.defaultPrevented, false, 'browser and app shortcuts with modifiers are left alone');
});

test('Space plays the portfolio chart with fills as clicks and stops on a second press, Escape or the end', async (t) => {
  environment(t);
  const contexts = withAudioContext(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fills = [{ at: oct(5), symbol: 'AAPL', quantity: 2, price: 227.4 }];
  const fixture = await render(t, PortfolioChart, { points: PORTFOLIO, period: '1M', fills });
  const svg = fixture.nativeElement.querySelector('svg[role="img"]');
  const access = fixture.debugElement.query((node) => node.componentInstance instanceof ChartAccess).componentInstance;
  assert.equal(contexts.length, 0, 'no audio before a key press');
  const space = key(' ', { code: 'Space' });
  svg.dispatchEvent(space);
  assert.equal(space.defaultPrevented, true, 'Space does not scroll the page');
  assert.equal(access.playing(), true);
  assert.equal(liveText(fixture), 'Playing the chart as sound. Press Space again to stop.');
  const oscillators = contexts[0].oscillators();
  assert.equal(oscillators.length, 2, 'the line and one click; the portfolio has no average cost');
  assert.ok(oscillators.every((o) => o.startedAt !== null));
  svg.dispatchEvent(key(' ', { code: 'Space' }));
  assert.equal(access.playing(), false);
  assert.ok(oscillators.every((o) => o.stops.length >= 2), 'every source stopped at once');
  assert.equal(liveText(fixture), 'Sound stopped.');
  svg.dispatchEvent(key(' ', { code: 'Space' }));
  assert.equal(access.playing(), true);
  svg.dispatchEvent(key('Escape'));
  assert.equal(access.playing(), false, 'Escape stops exploring, sound included');
  svg.dispatchEvent(key(' ', { code: 'Space' }));
  t.mock.timers.tick(3100);
  assert.equal(access.playing(), false, 'ends by itself after about 3 seconds');
  fixture.destroy();
  assert.equal(contexts[0].closed, true, 'the audio context is released with the chart');
});

test('Space says when there is nothing to play or no Web Audio, and live-update pauses never block a key press', async (t) => {
  environment(t);
  withAudioContext(t, null);
  const fixture = await render(t, PortfolioChart, { points: PORTFOLIO, period: '1M' });
  const svg = fixture.nativeElement.querySelector('svg[role="img"]');
  svg.dispatchEvent(key(' '));
  assert.equal(liveText(fixture), 'Sound is not available in this browser.');
  const access = fixture.debugElement.query((node) => node.componentInstance instanceof ChartAccess).componentInstance;
  access.toggleSound(chartSound([]));
  assert.equal(liveText(fixture), 'There are no prices to play yet.');
});

test('Space is the person\'s own action, so it plays with reduced motion and paused live updates', async (t) => {
  const bounds = { width: 600, height: 320, left: 0, top: 0 };
  t.mock.method(browser.SVGElement.prototype, 'getBoundingClientRect', () => bounds);
  t.mock.method(browser, 'matchMedia', () => Object.assign(new browser.EventTarget(), { matches: true }));
  t.mock.method(browser, 'ResizeObserver', function () { return { observe() {}, disconnect() {} }; });
  const contexts = withAudioContext(t);
  const store = { read: (section, parse) => parse(section === 'livePrices' ? { paused: true } : undefined), write() {} };
  const fixture = await render(t, PortfolioChart, { points: PORTFOLIO, period: '1M' }, [{ provide: AccessibilityStore, useValue: store }]);
  const svg = fixture.nativeElement.querySelector('svg[role="img"]');
  svg.dispatchEvent(key(' '));
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].oscillators().length, 1, 'no fills, so just the line');
  svg.dispatchEvent(key(' '));
});

function stockChart(t, inputs) {
  environment(t);
  return render(t, StockSvgChart, inputs).then((fixture) => {
    const ticks = Array.from({ length: 30 }, (_, i) => ({ time: oct(14) / 1000 + i * 60, price: 180 + i / 10 }));
    fixture.componentInstance.setHistory(ticks);
    animateFrame(performance.now() + 1000);
    fixture.detectChanges();
    return { fixture, svg: fixture.nativeElement.querySelector('svg'), ticks };
  });
}

test('the advanced price chart announces steps with the company\'s trades and pages through a tenth', async (t) => {
  const trades = [{ side: 'BUY', quantity: 2, price: 180.5, at: oct(14) + 5 * 60000, label: '' }];
  const { fixture, svg } = await stockChart(t, { trades, averageCost: 181, asset: { symbol: 'AAPL', name: 'Apple Inc.' } });
  svg.dispatchEvent(key('End'));
  assert.equal(liveText(fixture), 'Oct 14, 10:59 AM, $182.90, up 0.05 percent. Latest point.');
  const tooltip = fixture.nativeElement.querySelector('.tooltip');
  assert.equal(tooltip.getAttribute('aria-live'), 'off', 'the tooltip shows the price; the live region says it once');
  assert.match(tooltip.textContent, /182\.90/);
  svg.dispatchEvent(key('PageDown'));
  assert.match(liveText(fixture), /^Oct 14, 10:56 AM, \$182\.60/, '3 of 30 points back');
  svg.dispatchEvent(key('PageUp'));
  assert.match(liveText(fixture), /^Oct 14, 10:59 AM/);
  svg.dispatchEvent(key('Home'));
  for (let i = 0; i < 5; i++) svg.dispatchEvent(key('ArrowRight'));
  assert.equal(liveText(fixture), 'Oct 14, 10:35 AM, $180.50, up 0.06 percent. You bought 2 shares of Apple here at $180.50.');

  const contexts = withAudioContext(t);
  svg.dispatchEvent(key(' '));
  const oscillators = contexts[0].oscillators();
  assert.equal(oscillators.length, 3, 'price line, average-cost hum and one buy click');
  assert.equal(oscillators.filter((o) => o.type === 'sine').length, 1, 'the average cost is the quiet sine');
  svg.dispatchEvent(key(' '));
  svg.dispatchEvent(key('Escape'));
  assert.equal(tooltip.hidden, true, 'Escape still returns to live');
});

test('private trades are neither said nor clicked on the advanced price chart', async (t) => {
  const trades = [{ side: 'BUY', quantity: 2, price: 180.5, at: oct(14) + 5 * 60000, label: '' }];
  const { fixture, svg } = await stockChart(t, { trades, averageCost: 181, privateValues: true, asset: { symbol: 'AAPL', name: 'Apple Inc.' } });
  svg.dispatchEvent(key('Home'));
  for (let i = 0; i < 5; i++) svg.dispatchEvent(key('ArrowRight'));
  assert.equal(liveText(fixture), 'Oct 14, 10:35 AM, $180.50, up 0.06 percent.');
  const contexts = withAudioContext(t);
  svg.dispatchEvent(key(' '));
  assert.equal(contexts[0].oscillators().length, 1, 'only the price line');
  svg.dispatchEvent(key(' '));
  svg.dispatchEvent(key('a'));
  assert.equal(fixture.componentInstance.company(), 'Apple');
});

test('the technical chart announces bars with their open, high and low, and takes D, T and Space', async (t) => {
  environment(t);
  const start = oct(14);
  const bars = [100, 101, 99, 102, 104].map((close, i) => ({ at: start + i * DAY, price: close,
    candle: { time: start + i * DAY, open: close - 1, high: close + 1, low: close - 2, close, volume: null } }));
  const trades = [{ side: 'SELL', quantity: 3, price: 102, at: start + 3 * DAY, label: '' }];
  const fixture = await render(t, TechnicalChart, { points: bars, window: { start, end: bars.at(-1).at }, symbol: 'MSFT', period: '1W', trades, averageCost: 100 });
  const svg = fixture.nativeElement.querySelector('svg.technical-plot');
  svg.dispatchEvent(key('End'));
  assert.equal(liveText(fixture), 'Oct 18, $104.00, up 1.96 percent. Latest point. Up bar: open $103.00, high $105.00, low $102.00.');
  svg.dispatchEvent(key('ArrowLeft'));
  assert.equal(liveText(fixture), 'Oct 17, $102.00, up 3.03 percent. Up bar: open $101.00, high $103.00, low $100.00. You sold 3 shares of Microsoft here at $102.00.');
  assert.equal(fixture.nativeElement.querySelector('.candle-detail').getAttribute('role'), null, 'the on-screen detail is not read a second time');
  svg.dispatchEvent(key('PageDown'));
  assert.equal(liveText(fixture), 'Oct 16, $99.00, down 1.98 percent. Up bar: open $98.00, high $100.00, low $97.00.', 'PageDown: one bar of five; the bar rose within its day');
  const unchanged = { ...bars[0], candle: { ...bars[0].candle, open: 100 } };
  assert.match(fixture.componentInstance.pointText([unchanged], 0), /Unchanged bar/);
  const fell = { ...bars[0], candle: { ...bars[0].candle, open: 101 } };
  assert.match(fixture.componentInstance.pointText([fell], 0), /Down bar/);
  svg.dispatchEvent(key('Escape'));
  assert.equal(fixture.componentInstance.inspected(), null);
  svg.dispatchEvent(key('x'));

  svg.dispatchEvent(key('t'));
  fixture.detectChanges();
  assert.equal(liveText(fixture), 'MSFT price and technical indicators data table shown after the chart.');
  svg.dispatchEvent(key('d'));
  assert.equal(liveText(fixture), fixture.componentInstance.description().trim());
  const contexts = withAudioContext(t);
  svg.dispatchEvent(key(' '));
  assert.equal(contexts[0].oscillators().length, 3, 'close prices, the average cost and one sell click');
  svg.dispatchEvent(key(' '));
  fixture.componentRef.setInput('privateValues', true);
  fixture.detectChanges();
  svg.dispatchEvent(key(' '));
  assert.equal(contexts[0].oscillators().length, 4, 'private trades add only the price line');
  svg.dispatchEvent(key(' '));
});

test('the RSI chart takes D and T but leaves Space to the page, having no sound of its own', async (t) => {
  environment(t);
  const start = oct(14);
  const bars = Array.from({ length: 16 }, (_, i) => {
    const price = 40 + (i % 3), at = start + i * 60000;
    return { at, price, candle: { time: at, open: price, high: price, low: price, close: price, volume: null } };
  });
  const fixture = await render(t, TechnicalChart, { points: bars, window: { start, end: bars.at(-1).at }, symbol: 'AAPL' });
  const rsi = fixture.nativeElement.querySelector('svg.rsi-plot');
  const space = key(' ');
  rsi.dispatchEvent(space);
  assert.equal(space.defaultPrevented, false);
  rsi.dispatchEvent(key('t'));
  fixture.detectChanges();
  assert.equal(liveText(fixture, 2), 'AAPL relative strength index data table shown after the chart.', 'the RSI chart\'s own table');
  assert.equal(liveText(fixture, 0), '', 'the price chart says nothing');
});
