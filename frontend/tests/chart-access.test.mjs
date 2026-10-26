import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, browser, button } from './dom-helper.mjs';
const { ChartAccess } = await import('../src/app/chart-access.ts');
const { ChartVoice } = await import('../src/app/chart-voice.ts');
const { technicalTable, describeTrades, volumeTable } = await import('../src/app/technical-chart-data.ts');
const { displayCandles } = await import('../src/app/technical-chart-math.ts');
const { AccessibilityStore } = await import('../src/app/accessibility.ts');
const { SwitchScanService } = await import('../../shared/switch-scan.ts');
const { seriesTable } = await import('../../shared/chart-description.ts');
const table = { columns: ['Time', 'Price'], rows: [['Today', '$12.34']] };
test('explanations and native tables keep focus, IDs, captions and scoped headers', async t => {
  const spoken = [];
  const fixture = await render(t, ChartAccess, { id: 'test-price', label: 'Apple prices', summary: 'Apple rose from real prices.', table }, [{ provide: ChartVoice, useValue: { stop() {}, speak: text => spoken.push(text) } }]);
  const explain = button(fixture, 'Explain this chart');
  assert.equal(explain.getAttribute('aria-controls'), 'test-price-summary');
  assert.equal(explain.getAttribute('aria-expanded'), 'true');
  assert.equal(fixture.nativeElement.querySelector('#test-price-summary').textContent, 'Apple rose from real prices.');
  assert.equal(spoken.length, 1);
  const toggle = [...fixture.nativeElement.querySelectorAll('button')].find(b => b.textContent === 'Show as table');
  toggle.focus(); toggle.click(); fixture.detectChanges();
  assert.equal(browser.document.activeElement, toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(fixture.nativeElement.querySelector('caption').textContent, 'Apple prices — data table');
  assert.equal(fixture.nativeElement.querySelectorAll('th[scope="col"]').length, 2);
  assert.equal(fixture.nativeElement.querySelector('th[scope="row"]').textContent, 'Today');
  fixture.componentRef.setInput('summary', 'Microsoft fell.');
  fixture.componentRef.setInput('table', { columns: ['Time', 'Price'], rows: [['Now', '$9.00']] });
  fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('#test-price-summary').textContent, 'Microsoft fell.');
  assert.match(fixture.nativeElement.querySelector('tbody').textContent, /\$9\.00/);
  toggle.click(); fixture.detectChanges();
  assert.equal(browser.document.activeElement, toggle); assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});
test('technical alternatives preserve missing volume, real trade times and average-cost meaning', () => {
  const at = Date.parse('2026-10-21T14:00:00Z');
  const points = [{ at, price: 20 }, { at: at + 60000, price: 22 }];
  const trades = [{ at: at + 30000, side: 'BUY', quantity: 2, price: 21 }];
  const result = technicalTable(points, [], trades, true, false, 21);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0][1], 'Unavailable');
  assert.equal(result.rows[0][5], 'Unavailable');
  assert.match(result.rows[2].at(-1), /Bought 2 at \$21\.00/);
  assert.deepEqual(result.references, [{ label: 'Average cost reference', value: '$21.00' }]);
  assert.deepEqual(technicalTable(points, [], trades, true, true, 21).references, []);
  assert.match(describeTrades(trades, 22, 21), /bought 2 shares.*above your average cost/);
  assert.doesNotMatch(describeTrades(trades, 22, 21, true), /21|22|bought/);
});

test('period/security updates coalesce, announce the loaded summary and cancel stale wording', async t => {
  const spoken = [];
  const fixture = await render(t, ChartAccess, { id: 'updating', label: 'Prices', context: 'AAPL|1D', summary: 'Apple rose.', table }, [{ provide: ChartVoice, useValue: { stop() {}, speak: text => spoken.push(text) } }]);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  fixture.componentInstance.focusSummary();
  fixture.componentRef.setInput('context', 'MSFT|1W');
  fixture.componentRef.setInput('summary', 'Microsoft. History is loading.');
  fixture.detectChanges();
  fixture.componentRef.setInput('summary', 'Microsoft fell over one week.');
  fixture.detectChanges();
  t.mock.timers.tick(600); fixture.detectChanges();
  assert.equal(fixture.componentInstance.announcement(), 'Microsoft fell over one week.');
  assert.deepEqual(spoken, ['Apple rose.', 'Microsoft fell over one week.']);
  fixture.componentRef.setInput('summary', 'Microsoft fell over one week. Latest price updated.');
  fixture.detectChanges(); t.mock.timers.tick(600); fixture.detectChanges();
  assert.equal(spoken.length, 2, 'background ticks must let the requested sentence finish');
});

test('table-only changes announce updates even when the summary extrema and endpoints are unchanged', async t => {
  const fixture = await render(t, ChartAccess, { id: 'prices', label: 'Prices', summary: 'Prices rose from 10 to 20.', table }, [{ provide: ChartVoice, useValue: { stop() {}, speak() {} } }]);
  button(fixture, 'Show as table');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const price of ['$11.10', '$11.20']) {
    fixture.componentRef.setInput('table', { columns: ['Time', 'Price'], rows: [['Midday', price]] });
    fixture.detectChanges();
    assert.equal(fixture.componentInstance.announcement(), '', 'clear the prior live-region message so the next update is announced');
    t.mock.timers.tick(600); fixture.detectChanges();
    assert.match(fixture.componentInstance.announcement(), /Chart data updated/);
    assert.match(fixture.nativeElement.querySelector('tbody').textContent, new RegExp(price.replace('$', '\\$')));
  }
});

test('volume alternatives preserve missing bars, genuine zeroes and sums from the actual renderer', () => {
  const at = Date.parse('2026-10-21T14:00:00Z');
  const source = [12, null, 0, 9].map((volume, i) => ({ at: at + i * 60000, price: 20, candle: { time: at + i * 60000, open: 19, high: 21, low: 18, close: 20, volume } }));
  const displayed = displayCandles(source, 2);
  const result = volumeTable(displayed, true);
  assert.equal(result.grouped, true);
  assert.deepEqual(result.rows.map(row => row.at(-1)), ['Unavailable', '9 shares']);
  assert.notEqual(result.rows[0][0], result.rows[0][1], 'aggregated intervals retain their start and end');
  assert.deepEqual(volumeTable(source).rows.map(row => row.at(-1)), ['12 shares', 'Unavailable', '0 shares', '9 shares']);
  assert.match(result.note, /every observation/);
});

test('exact OHLC rows keep separate bars sharing a closing timestamp, and include each fill once', () => {
  const at = Date.parse('2026-10-21T14:00:00Z');
  const points = [1, 2].map(i => ({ at, price: 20 + i, candle: { time: at - i * 60000, open: 20, high: 24, low: 19, close: 20 + i, volume: i * 10 } }));
  const trade = { at, side: 'BUY', quantity: 2, price: 21 };
  const table = technicalTable(points, [], [trade], false);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows.map(row => row[4]), ['21', '22']);
  assert.deepEqual(table.rows.map(row => row[5]), ['10', '20']);
  assert.equal(table.rows.filter(row => row.at(-1).includes('Bought 2')).length, 1);
});

test('a large table switches between daily groups and exact observations without moving focus', async t => {
  const points = Array.from({ length: 500 }, (_, i) => ({ at: Date.parse('2026-10-01T14:00:00Z') + i * 3600000, value: 10 + i }));
  const fixture = await render(t, ChartAccess, { id: 'large', label: 'Recorded prices', summary: 'Recorded prices rose.', table: seriesTable(points), rawTable: seriesTable(points, {}, false) }, [{ provide: ChartVoice, useValue: { stop() {}, speak() {} } }]);
  button(fixture, 'Show as table');
  const days = fixture.nativeElement.querySelectorAll('tbody tr').length;
  const toggle = [...fixture.nativeElement.querySelectorAll('button')].find(b => b.textContent === 'Show every observation');
  toggle.focus(); toggle.click(); fixture.detectChanges();
  assert.equal(browser.document.activeElement, toggle);
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(fixture.nativeElement.querySelectorAll('tbody tr').length, 500);
  toggle.click(); fixture.detectChanges();
  assert.equal(browser.document.activeElement, toggle);
  assert.equal(fixture.nativeElement.querySelectorAll('tbody tr').length, days);
  assert.ok(days < 500);
});

test('chart voice uses the shared preference, rejects corrupt flags, and preserves other voice choices', async t => {
  const store = new AccessibilityStore();
  store.write('voice', { enabled: true, detail: 'Detailed', cues: false });
  const fixture = await render(t, ChartAccess, { id: 'voice', label: 'Prices', summary: 'Recorded values.', table }, [
    { provide: AccessibilityStore, useValue: store },
    { provide: SwitchScanService, useValue: { settings: () => ({ enabled: false, speak: false }) } },
  ]);
  const voice = fixture.componentInstance.voice;
  assert.equal(voice.enabled(), true);
  voice.setEnabled(false);
  assert.equal(voice.enabled(), false);
  assert.deepEqual(store.read('voice', v => v), { enabled: true, detail: 'Detailed', cues: false, chartSummaries: false });
  store.write('voice', { enabled: 'true', chartSummaries: 'false' });
  assert.equal(voice.enabled(), false);
  store.write('voice', { enabled: true, chartSummaries: 'invalid' });
  assert.equal(voice.enabled(), true);
});

test('main scanner owns focus speech and explicit explanations queue after its selection confirmation', async t => {
  const spoken = [];
  let enabled = true;
  const fixture = await render(t, ChartAccess, { id: 'scan', label: 'Prices', summary: 'Prices rose.', table }, [
    { provide: AccessibilityStore, useValue: new AccessibilityStore() },
    { provide: SwitchScanService, useValue: {
      settings: () => ({ enabled, speak: true }), announce: text => spoken.push(text),
    } },
  ]);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const voice = fixture.componentInstance.voice;
  fixture.componentInstance.focusSummary();
  assert.deepEqual(spoken, [], 'chart focus must not add speech while the scanner is moving');
  button(fixture, 'Explain this chart');
  spoken.push('Explain this chart selected.');
  t.mock.timers.tick(1);
  assert.deepEqual(spoken, ['Explain this chart selected.', 'Prices rose.']);
  voice.speak('Stale request', 'scan', true);
  voice.stop('scan');
  t.mock.timers.tick(1);
  assert.equal(spoken.length, 2, 'collapsing or destroying a chart cancels pending narration');
  voice.speak('Switch turned off', 'scan', true);
  enabled = false;
  t.mock.timers.tick(1);
  assert.equal(spoken.length, 2);
});
