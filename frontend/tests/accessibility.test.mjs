import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, browser } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
import { Injector, runInInjectionContext } from '@angular/core';
const {
  ACCESSIBILITY_STARTUP, ACCESSIBILITY_STORAGE_KEY, AccessibilityStore, parseAccessibility, provideAccessibilityStartup, runAccessibilityStartup,
} = await import('../src/app/accessibility.ts');
const { AccessibilitySettings } = await import('../src/app/accessibility-settings.ts');
const { KEYBOARD_SHORTCUTS, KeyboardShortcuts, isShortcutsKey } = await import('../src/app/keyboard-shortcuts.ts');
const { NoviceDashboard } = await import('../src/app/novice-dashboard.ts');
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');

/** Browser storage that can be read back, or that throws like a blocked browser. */
function withStorage(t, { blocked = false } = {}) {
  const values = new Map();
  const fail = () => { throw new Error('storage blocked'); };
  const storage = blocked
    ? { getItem: fail, setItem: fail }
    : { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  });
  return values;
}

// What a feature section would look like: a parser that turns anything unexpected into "off".
const parseToggle = (saved) => ({ enabled: saved?.enabled === true });

test('every feature starts off when nothing has been saved', (t) => {
  withStorage(t);
  const store = new AccessibilityStore();
  for (const section of ['briefing', 'switchControl', 'voice', 'colourMode', 'livePrices']) {
    assert.deepEqual(store.read(section, parseToggle), { enabled: false }, section);
  }
});

test('settings are kept under one browser entry and survive a reload', (t) => {
  const values = withStorage(t);
  new AccessibilityStore().write('switchControl', { enabled: true });
  new AccessibilityStore().write('briefing', { enabled: true });
  assert.deepEqual(JSON.parse(values.get(ACCESSIBILITY_STORAGE_KEY)), {
    switchControl: { enabled: true }, briefing: { enabled: true },
  });
  const reloaded = new AccessibilityStore();
  assert.deepEqual(reloaded.read('switchControl', parseToggle), { enabled: true });
  assert.deepEqual(reloaded.read('voice', parseToggle), { enabled: false });
});

test('a corrupt or unexpected saved entry falls back to defaults', () => {
  assert.deepEqual(parseAccessibility(null), {});
  assert.deepEqual(parseAccessibility('{oops'), {});
  assert.deepEqual(parseAccessibility('[1,2]'), {});
  assert.deepEqual(parseAccessibility('"text"'), {});
  assert.deepEqual(parseAccessibility('{"voice":{"enabled":true}}'), { voice: { enabled: true } });
});

test('blocked storage means defaults on load, and changes still apply for the visit', (t) => {
  withStorage(t, { blocked: true });
  const store = new AccessibilityStore();
  assert.deepEqual(store.read('colourMode', parseToggle), { enabled: false });
  assert.doesNotThrow(() => store.write('colourMode', { enabled: true }));
  assert.deepEqual(store.read('colourMode', parseToggle), { enabled: true });
});

test('startup runs each feature\'s setup with the saved settings, before the app draws', (t) => {
  const values = withStorage(t);
  values.set(ACCESSIBILITY_STORAGE_KEY, JSON.stringify({ colourMode: { enabled: true } }));
  const seen = [];
  const register = provideAccessibilityStartup((store) => seen.push(store.read('colourMode', parseToggle)));
  const injector = Injector.create({ providers: [AccessibilityStore, register] });
  runInInjectionContext(injector, runAccessibilityStartup);
  assert.deepEqual(seen, [{ enabled: true }]);
  assert.equal(register.provide, ACCESSIBILITY_STARTUP);
  const none = Injector.create({ providers: [AccessibilityStore] });
  assert.doesNotThrow(() => runInInjectionContext(none, runAccessibilityStartup), 'no feature registered yet');
});

test('the Accessibility section has a heading and opens the shortcuts from a keyboard-reachable button', async (t) => {
  const fixture = await render(t, AccessibilitySettings);
  const root = fixture.nativeElement;
  const section = root.querySelector('section');
  const heading = root.querySelector('h2');
  assert.equal(heading.textContent.trim(), 'Accessibility');
  assert.equal(section.getAttribute('aria-labelledby'), heading.id);
  let opened = 0;
  fixture.componentInstance.openShortcuts.subscribe(() => opened++);
  const cards = [...root.querySelectorAll('[data-scan-group]')].map((el) => el.getAttribute('data-scan-group'));
  assert.deepEqual(cards, ['Accessibility', 'Voice assistance', 'Read on demand', 'Visual assistance', 'Audio briefing', 'Switch control', 'Captions'], 'new tools preserve the PS-18 and PS-19 cards');
  const view = [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === 'View shortcuts');
  assert.equal(view.getAttribute('type'), 'button', 'a real button, reachable by Tab, Enter, Space and switch control');
  view.click();
  assert.equal(opened, 1);
});

test('the shortcut list shows every shortcut with its keys', async (t) => {
  const fixture = await render(t, KeyboardShortcuts);
  const rows = fixture.nativeElement.querySelectorAll('.shortcut-list > div');
  assert.equal(rows.length, KEYBOARD_SHORTCUTS.length);
  assert.ok(KEYBOARD_SHORTCUTS.some((s) => s.keys.includes('?')), 'lists how to open itself');
  const chart = [...rows].find((row) => row.textContent.includes('Home'));
  assert.deepEqual([...chart.querySelectorAll('kbd')].map((k) => k.textContent), ['Home', 'End']);
});

test('"?" opens the shortcuts, but not while typing or with a modifier held', () => {
  const key = (extra) => ({ key: '?', target: browser.document.body, ...extra });
  assert.equal(isShortcutsKey(key()), true);
  assert.equal(isShortcutsKey(key({ key: '/' })), false);
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(isShortcutsKey(key({ target: { tagName } })), false, tagName);
  }
  assert.equal(isShortcutsKey(key({ target: { tagName: 'DIV', isContentEditable: true } })), false);
  assert.equal(isShortcutsKey(key({ ctrlKey: true })), false);
  assert.equal(isShortcutsKey(key({ altKey: true })), false);
  assert.equal(isShortcutsKey(key({ metaKey: true })), false);
});

test('the Settings page of both dashboards has the Accessibility section', async (t) => {
  const { StockDashboard } = await import('../src/app/stock-dashboard.ts');
  const { StockDashboardComponent } = await import('../src/app/stock-dashboard.component.ts');
  t.mock.method(StockDashboardComponent.prototype, 'ngAfterViewInit', () => {});
  const fixture = await render(t, StockDashboard, { name: 'Ada', level: 'NOVICE' });
  const root = fixture.nativeElement;
  const openSettings = (dashboard) => {
    const settings = [...root.querySelectorAll(`${dashboard} button`)].find((b) => b.textContent.trim() === 'Settings');
    assert.ok(settings, `${dashboard} has a Settings page`);
    settings.click(); fixture.detectChanges();
    const section = root.querySelector(`${dashboard} app-accessibility-settings`);
    assert.ok(section, `${dashboard} shows the Accessibility section`);
    assert.equal(section.querySelector('h2').textContent.trim(), 'Accessibility');
  };
  openSettings('app-novice-dashboard');
  fixture.componentRef.setInput('level', 'ADVANCED'); fixture.detectChanges();
  openSettings('app-advanced-dashboard');
});

for (const [name, Dashboard] of [['novice', NoviceDashboard], ['advanced', AdvancedDashboard]]) {
  test(`the ${name} dashboard opens Keyboard Shortcuts on "?", and leaves an open dialog alone`, (t) => {
    const desk = component(t, Dashboard, [feedProvider(fakeFeed([]))]);
    let prevented = 0;
    const press = (extra = {}) => ({ key: '?', target: browser.document.body, preventDefault: () => prevented++, ...extra });
    desk.onShortcutKey(press({ target: { tagName: 'INPUT' } }));
    assert.notEqual(desk.modal(), 'shortcuts', 'typing a ? in a field types it');
    desk.onShortcutKey(press());
    assert.equal(desk.modal(), 'shortcuts');
    assert.equal(prevented, 1);
    desk.modal.set('trade');
    desk.dialog = () => ({ nativeElement: { open: true } });
    desk.onShortcutKey(press());
    assert.equal(desk.modal(), 'trade', 'an open trade is never replaced');
  });
}
