import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { browser } from './dom-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { NoviceDashboard } = await import('../src/app/novice-dashboard.ts');

function storage(t, value = null, blocked = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map(value === null ? [] : [['nexttrade.novice.sidebarWidth', value]]);
  const saved = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => { if (blocked) throw new Error('Storage blocked'); return values.get(key) ?? null; },
    setItem: (key, next) => { if (blocked) throw new Error('Storage blocked'); values.set(key, next); saved.push([key, next]); },
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  return { values, saved };
}
const dashboard = t => component(t, NoviceDashboard, [feedProvider(fakeFeed([]))]);

test('dragging the sidebar uses the shell offset, remembers its width and removes listeners on release', t => {
  const saved = storage(t, '224');
  const desk = dashboard(t);
  const shell = browser.document.createElement('div');
  shell.className = 'novice-shell';
  const handle = browser.document.createElement('button');
  shell.append(handle); browser.document.body.append(shell);
  t.after(() => shell.remove());
  t.mock.method(shell, 'getBoundingClientRect', () => ({ left: 20 }));
  handle.addEventListener('pointerdown', event => desk.startSidebarResize(event));
  handle.dispatchEvent(new browser.PointerEvent('pointerdown', { button: 2 }));
  assert.equal(desk.resizingSidebar(), false, 'secondary buttons do not resize');
  const start = new browser.PointerEvent('pointerdown', { button: 0, cancelable: true });
  handle.dispatchEvent(start);
  assert.equal(start.defaultPrevented, true);
  assert.equal(desk.resizingSidebar(), true);
  browser.dispatchEvent(new browser.PointerEvent('pointermove', { clientX: 300 }));
  assert.equal(desk.sidebarWidth(), 280, 'the sidebar starts at the shell, not at the viewport edge');
  browser.dispatchEvent(new browser.PointerEvent('pointerup'));
  assert.equal(desk.resizingSidebar(), false);
  assert.equal(saved.saved.at(-1)[1], '280');
  assert.equal(dashboard(t).sidebarWidth(), 280, 'a new dashboard restores the saved width');
  browser.dispatchEvent(new browser.PointerEvent('pointermove', { clientX: 100 }));
  assert.equal(desk.sidebarWidth(), 280, 'released dragging no longer changes the sidebar');
  desk.toggleSidebar(); desk.toggleSidebar();
  assert.equal(desk.sidebarWidth(), 280, 'reopening restores the dragged width');
});

test('cancelling a narrow sidebar drag snaps to icons and keeps ordinary keys available', t => {
  storage(t);
  const desk = dashboard(t);
  const handle = browser.document.createElement('button');
  handle.addEventListener('pointerdown', event => desk.startSidebarResize(event));
  handle.dispatchEvent(new browser.PointerEvent('pointerdown', { button: 0 }));
  browser.dispatchEvent(new browser.PointerEvent('pointermove', { clientX: 80 }));
  browser.dispatchEvent(new browser.PointerEvent('pointercancel'));
  assert.equal(desk.sidebarWidth(), desk.sidebarMin);
  assert.equal(desk.resizingSidebar(), false);
  browser.dispatchEvent(new browser.PointerEvent('pointermove', { clientX: 300 }));
  assert.equal(desk.sidebarWidth(), desk.sidebarMin);
  const tab = new browser.KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
  desk.resizeSidebarWithKeys(tab);
  assert.equal(tab.defaultPrevented, false);
  desk.resizeSidebarWithKeys(new browser.KeyboardEvent('keydown', { key: 'End' }));
  assert.equal(desk.sidebarWidth(), desk.sidebarMax);
  desk.resizeSidebarWithKeys(new browser.KeyboardEvent('keydown', { key: 'Home' }));
  assert.equal(desk.sidebarWidth(), desk.sidebarMin);
});

test('blocked browser storage does not prevent sidebar resizing', t => {
  storage(t, null, true);
  const desk = dashboard(t);
  assert.equal(desk.sidebarWidth(), 224);
  desk.resizeSidebarWithKeys(new browser.KeyboardEvent('keydown', { key: 'End' }));
  assert.equal(desk.sidebarWidth(), desk.sidebarMax);
});
