import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeSeries, seriesTable, seriesPoints, categoryDescription, categoryTable, comparisonDescription, comparisonTable } from '../../shared/chart-description.ts';
import { ChartNarrator } from '../../shared/chart-narrator.ts';
const at = Date.parse('2026-10-20T14:00:00Z');
const points = values => values.map((value, i) => ({ at: at + i * 86400000, value }));
const options = { name: 'Apple', period: 'past week', currency: 'USD' };

test('describeSeries explains rising, falling and flat data with recorded dates and extremes', () => {
  const rising = describeSeries(points([100, 95, 120]), options);
  assert.match(rising, /Apple, past week rose 20 percent/);
  assert.match(rising, /from \$100\.00.*Oct 20.*to \$120\.00.*Oct 22/);
  assert.match(rising, /Low was \$95\.00.*Oct 21.*high was \$120\.00.*Oct 22/);
  assert.match(describeSeries(points([100, 80]), options), /fell 20 percent/);
  assert.match(describeSeries(points([100, 100]), options), /was unchanged/);
});
test('empty, singleton, zero baseline and invalid observations never invent a trend or value', () => {
  assert.match(describeSeries([], options), /No recorded observations/);
  assert.match(describeSeries(points([0]), options), /One observation: \$0\.00/);
  const zero = describeSeries(points([0, 10]), options);
  assert.match(zero, /starting value is zero/); assert.doesNotMatch(zero, /rose 0 percent|Infinity|NaN/);
  assert.match(describeSeries([{ at: NaN, value: 50 }, { at, value: NaN }]), /No recorded/);
  assert.match(describeSeries(points([1, 2]), { hidden: true }), /Amounts are hidden/);
  assert.doesNotMatch(describeSeries(points([1234, 9876]), { hidden: true }), /1234|9876/);
});
test('source normalization is chronological, deduplicates timestamps, preserves zero and does not mutate input', () => {
  const input = [{ at: at + 1, value: 2 }, { at, value: 0 }, { at: at + 1, value: 3 }];
  const snapshot = structuredClone(input);
  assert.deepEqual(seriesPoints(input).map(p => p.value), [0, 3]); assert.deepEqual(input, snapshot);
});
test('tables retain eight-decimal recorded prices while summaries use readable amounts and small-change wording', () => {
  const ps = [{ at, value: 1.23456789 }, { at: at + 1000, value: 1.23456790 }];
  assert.equal(seriesTable(ps, options).rows[0][1], '$1.23456789');
  assert.match(describeSeries(ps, options), /rose less than 0.01 percent/);
  assert.match(describeSeries(ps, options), /from \$1\.23/);
  assert.match(describeSeries([{ at: Number.MAX_VALUE, value: 1 }], options), /No recorded observations/);
});
test('OHLC summary uses actual intrabar highs and lows rather than only closing prices', () => {
  const text = describeSeries([{ at, value: 10, low: 8, high: 20 }, { at: at + 1, value: 12, low: 9, high: 15 }]);
  assert.match(text, /Low was 8.*high was 20/);
});
test('daily grouping preserves first, last, extrema, observation counts and exact raw values', () => {
  const ps = Array.from({ length: 1000 }, (_, i) => ({ at: at + i * 600000, value: 100 + i % 11 }));
  const grouped = seriesTable(ps, options);
  assert.match(grouped.note, /Grouped by Central/);
  assert.equal(grouped.rows.reduce((n, r) => n + Number(r.at(-1)), 0), 1000);
  const raw = seriesTable(ps, options, false);
  assert.equal(raw.rows.length, 1000); assert.equal(raw.rows[0][1], '$100.00');
  assert.equal(raw.rows.at(-1)[1], '$109.00');
  assert.deepEqual(seriesTable(ps, { hidden: true }).rows, []);
});
test('reported volume groups sum real values and unknown volume is never replaced by zero', () => {
  const ps = Array.from({ length: 500 }, (_, i) => ({ at: at + i * 600000, value: 10 }));
  const table = seriesTable(ps, { unit: 'shares' }, true, true);
  assert.equal(table.rows.reduce((n, r) => n + Number(r[1].replace(/[^\d.]/g, '')), 0), 5000);
  assert.match(describeSeries([], { empty: 'Reported volume is unavailable.' }), /unavailable/);
});

test('large intraday financial series also group, while category labels never become fictional calendar days', () => {
  const intraday = Array.from({ length: 500 }, (_, i) => ({ at: at + i * 1000, value: i }));
  const grouped = seriesTable(intraday);
  assert.equal(grouped.grouped, true);
  assert.equal(grouped.rows.length, 1);
  assert.equal(grouped.rows[0].at(-1), '500');
  const categorical = seriesTable(intraday.map((p, i) => ({ ...p, label: `Category ${i}` })), { categorical: true });
  assert.equal(categorical.grouped, undefined);
  assert.equal(categorical.rows.length, 500);
});
test('allocation summaries and tables use real values, shares, and balance privacy', () => {
  const categories = [{ label: 'Stocks', value: 150, percent: 75 }, { label: 'Cash', value: 50, percent: 25 }];
  assert.match(categoryDescription('Allocation', categories), /Stocks: \$150\.00, 75 percent; Cash: \$50\.00, 25 percent/);
  assert.deepEqual(categoryTable(categories).rows, [['Stocks', '$150.00', '75%'], ['Cash', '$50.00', '25%']]);
  assert.deepEqual(categoryTable(categories, true).rows, []);
  assert.match(categoryDescription('Allocation', [], false), /No assets/);
});

test('sector and heat-map comparisons describe each actual return without inventing a trend between categories', () => {
  const rows = [{ label: 'Technology', value: 1.25 }, { label: 'Energy', value: -2.5 }, { label: 'Cash', value: 0 }, { label: 'Unknown', value: NaN }];
  assert.match(comparisonDescription('Sectors', rows), /Technology: up 1.25 percent; Energy: down 2.5 percent; Cash: unchanged at 0 percent/);
  assert.doesNotMatch(comparisonDescription('Sectors', rows), /rose|fell|Unknown|NaN/);
  assert.deepEqual(comparisonTable(rows).rows, [['Technology', '+1.25%'], ['Energy', '-2.5%'], ['Cash', '0%']]);
  assert.match(comparisonDescription('Sectors', []), /No recorded changes/);
});
test('chart speech respects the briefing, releases its own owner, and handles unsupported browsers', t => {
  const synthDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'speechSynthesis');
  const utteranceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'SpeechSynthesisUtterance');
  let cancels = 0; const spoken = [];
  const synth = { speaking: false, cancel() { cancels++; }, speak(u) { spoken.push(u); } };
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: synth });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(text) { this.text = text; } } });
  t.after(() => { for (const [name, descriptor] of [['speechSynthesis', synthDescriptor], ['SpeechSynthesisUtterance', utteranceDescriptor]]) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const voice = new ChartNarrator();
  synth.speaking = true; assert.equal(voice.speak('Briefing is speaking', 'chart'), false); assert.equal(cancels, 0);
  synth.speaking = false; assert.equal(voice.speak('Actual summary', 'chart', 1.25), true); assert.equal(spoken[0].rate, 1.25);
  voice.stop('another-chart'); assert.equal(cancels, 0);
  voice.stop('chart'); assert.equal(cancels, 1);
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: undefined });
  assert.equal(voice.speak('No speech engine', 'chart'), false);
});
