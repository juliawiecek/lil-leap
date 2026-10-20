import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { render, browser } from './dom-helper.mjs';
const { COLOR_MODE_STORAGE_KEY, ColorModeService, applyColorMode, parseColorMode } = await import('../src/app/color-mode.ts');
const { ColorModeSettings } = await import('../src/app/color-mode-settings.ts');

const root = () => document.documentElement;

function withStorage(t) {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
    delete root().dataset.colorMode;
  });
  return values;
}

test('anything but a saved color-blind choice means standard colors', () => {
  assert.equal(parseColorMode(null), 'standard');
  assert.equal(parseColorMode('purple'), 'standard');
  assert.equal(parseColorMode('colorblind'), 'colorblind');
});

test('the mode is put on the page and taken off again', (t) => {
  t.after(() => delete root().dataset.colorMode);
  applyColorMode('colorblind');
  assert.equal(root().getAttribute('data-color-mode'), 'colorblind');
  applyColorMode('standard');
  assert.equal(root().hasAttribute('data-color-mode'), false);
});

test('the service saves the choice and applies it again after a reload', (t) => {
  const values = withStorage(t);
  const service = new ColorModeService();
  assert.equal(service.mode(), 'standard');
  service.set('colorblind');
  assert.equal(values.get(COLOR_MODE_STORAGE_KEY), 'colorblind');
  assert.equal(root().dataset.colorMode, 'colorblind');
  delete root().dataset.colorMode;
  const reloaded = new ColorModeService();
  assert.equal(reloaded.mode(), 'colorblind');
  assert.equal(root().dataset.colorMode, 'colorblind', 'applied before anything draws');
});

test('the settings card turns color-blind colors on and off', async (t) => {
  let mode = 'standard';
  const fake = { mode: () => mode, set: (next) => { mode = next; } };
  const fixture = await render(t, ColorModeSettings, {}, [{ provide: ColorModeService, useValue: fake }]);
  const toggle = fixture.nativeElement.querySelector('.color-toggle');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  toggle.click();
  assert.equal(mode, 'colorblind');
  fixture.detectChanges();
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.match(toggle.textContent, /On/);
  toggle.click();
  assert.equal(mode, 'standard');
});

test('gains and losses everywhere read the color-blind tokens, with arrows as a second clue', () => {
  const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const styles = read('styles.scss');
  assert.match(styles, /\[data-color-mode='colorblind'\] \{[^}]*--gain:[^}]*--loss:/);
  assert.match(styles, /content: '▲ ' \/ ''/);
  assert.match(styles, /content: '▼ ' \/ ''/);
  for (const file of ['app/advanced-dashboard.scss', 'app/advanced-ticket.scss', 'app/advanced-chart.scss',
    'app/novice-dashboard.scss', 'app/activity-feed.scss', 'app/market-ticker.ts', 'app/portfolio-chart.ts']) {
    const source = read(file);
    assert.match(source, /var\(--gain\b/, `${file} colors gains with --gain`);
    assert.match(source, /var\(--loss\b/, `${file} colors losses with --loss`);
  }
  assert.ok(browser, 'runs in the shared test browser');
});
