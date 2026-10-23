import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signal } from '@angular/core';
import { component } from './component-helper.mjs';
import { render } from './dom-helper.mjs';
const { InsightsChartAccess, InsightsChartVoice } = await import('../src/app/shared/insights-chart-access.ts');
const { SiteAccessibility } = await import('../src/app/site-accessibility.ts');

function globalValue(t, name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name]; });
}

test('Insights chart speech is opt-in, respects focus speech, remembers the preference and stops when disabled', t => {
  const saved = new Map();
  const spoken = [];
  let cancelled = 0;
  globalValue(t, 'localStorage', { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) });
  globalValue(t, 'SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
  globalValue(t, 'speechSynthesis', {
    speaking: false, getVoices: () => [{ localService: true, default: true, voiceURI: 'local-test' }],
    speak: utterance => spoken.push(utterance), cancel: () => { cancelled++; },
  });
  let navigation = { enabled: false, focus: false, rate: 1.25 };
  const providers = [{ provide: SiteAccessibility, useValue: { settings: () => navigation } }];
  const voice = component(t, InsightsChartVoice, providers);
  voice.speak('No automatic speech before opting in.', 'orders');
  assert.equal(spoken.length, 0);
  voice.setEnabled(true);
  assert.equal(saved.get('nexttrade-insights.chart-voice'), 'on');
  assert.equal(component(t, InsightsChartVoice, providers).enabled(), true, 'another chart restores the shared preference');
  navigation = { ...navigation, enabled: true, focus: true };
  voice.speak('The focus reader already owns this.', 'orders');
  assert.equal(spoken.length, 0);
  voice.speak('Two orders have been placed.', 'orders', true);
  assert.equal(spoken[0].text, 'Two orders have been placed.');
  assert.equal(spoken[0].rate, 1.25);
  voice.setEnabled(false);
  assert.equal(cancelled, 1);
  assert.equal(saved.get('nexttrade-insights.chart-voice'), 'off');
  voice.speak('Disabled summaries stay silent.', 'orders', true);
  assert.equal(spoken.length, 1);
});

test('blocked storage does not prevent turning Insights chart speech on and off', t => {
  globalValue(t, 'localStorage', { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } });
  const voice = component(t, InsightsChartVoice, [{ provide: SiteAccessibility, useValue: { settings: () => ({}) } }]);
  assert.equal(voice.enabled(), false);
  voice.setEnabled(true);
  assert.equal(voice.enabled(), true);
  voice.setEnabled(false);
  assert.equal(voice.enabled(), false);
});

test('Insights explanations stop on collapse and only settled, current chart updates are announced', async t => {
  const spoken = [], stopped = [];
  const voice = { enabled: signal(false), setEnabled() {}, speak: (...args) => spoken.push(args), stop: id => stopped.push(id) };
  const table = { columns: ['Time', 'Orders'], rows: [['Midnight', '0'], ['Now', '2']] };
  const fixture = await render(t, InsightsChartAccess,
    { id: 'orders', label: 'Orders today', summary: 'Two orders.', table, context: 'today' },
    [{ provide: InsightsChartVoice, useValue: voice }]);
  const chart = fixture.componentInstance;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  chart.explain(); fixture.detectChanges();
  assert.deepEqual(spoken.at(-1), ['Two orders.', 'orders', true]);
  chart.explain(); fixture.detectChanges();
  assert.equal(chart.explained(), false);
  assert.equal(stopped.at(-1), 'orders');
  fixture.componentRef.setInput('summary', 'Three orders.'); fixture.detectChanges();
  t.mock.timers.tick(600); fixture.detectChanges();
  assert.equal(spoken.length, 1, 'background changes do not start speech');
  chart.focusSummary(); fixture.detectChanges();
  fixture.componentRef.setInput('context', 'yesterday');
  fixture.componentRef.setInput('summary', 'History is loading.'); fixture.detectChanges();
  t.mock.timers.tick(600); fixture.detectChanges();
  fixture.componentRef.setInput('summary', 'Yesterday had four orders.'); fixture.detectChanges();
  t.mock.timers.tick(599); fixture.detectChanges();
  assert.equal(chart.announcement(), '');
  t.mock.timers.tick(1); fixture.detectChanges();
  assert.equal(chart.announcement(), 'Yesterday had four orders.');
  assert.deepEqual(spoken.at(-1), ['Yesterday had four orders.', 'orders']);
  chart.focused.set(false); chart.shown.set(true); fixture.detectChanges();
  const count = spoken.length;
  fixture.componentRef.setInput('table', { ...table, rows: [['Midnight', '0'], ['Now', '4']] }); fixture.detectChanges();
  t.mock.timers.tick(600); fixture.detectChanges();
  assert.match(chart.announcement(), /Chart data updated/);
  assert.equal(spoken.length, count, 'a table update does not take over narration');
  fixture.componentRef.setInput('summary', 'Amounts are hidden.'); fixture.detectChanges();
  t.mock.timers.tick(600); fixture.detectChanges();
  assert.equal(chart.announcement(), 'Amounts are hidden.');
  assert.equal(stopped.at(-1), 'orders');
});
