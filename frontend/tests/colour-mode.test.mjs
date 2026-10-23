import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { Injector, runInInjectionContext } from '@angular/core';
import { component } from './component-helper.mjs';
import { render, browser } from './dom-helper.mjs';
const { AccessibilityStore, ACCESSIBILITY_STORAGE_KEY, runAccessibilityStartup } = await import('../src/app/accessibility.ts');
const { ColourModeStore, provideColourMode } = await import('../src/app/colour-mode.ts');
const { parseColourMode, applyColourMode, restoreColourMode } = await import('../src/app/colour-mode-preferences.ts');
const { AccessibilitySettings } = await import('../src/app/accessibility-settings.ts');
const { readThemeColour, readThemeRgb, observeColourMode } = await import('../src/app/theme-colours.ts');

function storage(t, initial = null, blocked = false) {
  let saved = initial;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { if (blocked) throw new Error('blocked'); return saved; },
    setItem(_key, value) { if (blocked) throw new Error('blocked'); saved = value; },
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
    document.documentElement.removeAttribute('data-colour-mode');
  });
  return () => saved;
}

test('colour preferences reject invalid and corrupt data and restore each saved mode before rendering', t => {
  for (const saved of [null, [], '', { mode: 'light' }, { mode: 3 }]) assert.equal(parseColourMode(saved), 'off');
  for (const mode of ['off', 'red-green', 'blue-yellow']) {
    assert.equal(parseColourMode({ mode }), mode);
    const root = { setAttribute: (...args) => assert.deepEqual(args, ['data-colour-mode', mode]) };
    applyColourMode(mode, root);
  }
  storage(t, '{broken');
  assert.equal(restoreColourMode(), 'off');
  assert.equal(document.documentElement.dataset.colourMode, 'off');
});

test('switching modes applies immediately and saves only the colour section of PS-17 preferences', t => {
  const saved = storage(t, JSON.stringify({ briefing: { enabled: true } }));
  const preferences = new AccessibilityStore();
  const colours = component(t, ColourModeStore, [{ provide: AccessibilityStore, useValue: preferences }]);
  assert.equal(colours.mode(), 'off');
  for (const mode of ['red-green', 'blue-yellow', 'off']) {
    colours.set(mode);
    assert.equal(document.documentElement.dataset.colourMode, mode);
    assert.equal(colours.mode(), mode);
    assert.deepEqual(JSON.parse(saved()), { briefing: { enabled: true }, colourMode: { mode } });
    assert.equal(new AccessibilityStore().read('colourMode', parseColourMode), mode);
    assert.equal(restoreColourMode(), mode);
  }
});

test('blocked storage still permits changes for this visit', t => {
  storage(t, null, true);
  const colours = component(t, ColourModeStore, [AccessibilityStore]);
  assert.equal(restoreColourMode(), 'off');
  assert.doesNotThrow(() => colours.set('blue-yellow'));
  assert.equal(colours.mode(), 'blue-yellow');
  assert.equal(document.documentElement.dataset.colourMode, 'blue-yellow');
});

test('PS-17 startup applies the saved colour mode without constructing a dashboard', t => {
  storage(t, JSON.stringify({ colourMode: { mode: 'red-green' } }));
  const injector = Injector.create({ providers: [AccessibilityStore, provideColourMode()] });
  runInInjectionContext(injector, runAccessibilityStartup);
  assert.equal(document.documentElement.dataset.colourMode, 'red-green');
  injector.destroy();
});

test('the actual pre-Angular script uses the same parser and safely handles every storage state', () => {
  const script = readFileSync(new URL('../public/colour-mode-init.js', import.meta.url), 'utf8');
  for (const saved of [null, '{bad', '42', '[]', ...['off', 'red-green', 'blue-yellow'].map(mode => JSON.stringify({ colourMode: { mode } }))]) {
    const attributes = new Map();
    const context = { localStorage: { getItem: key => { assert.equal(key, ACCESSIBILITY_STORAGE_KEY); return saved; } },
      document: { documentElement: { setAttribute: (name, value) => attributes.set(name, value) }, addEventListener() {} } };
    runInNewContext(script, context);
    const expected = saved?.startsWith('{"colourMode"') ? JSON.parse(saved).colourMode.mode : 'off';
    assert.equal(attributes.get('data-colour-mode'), expected);
  }
  const context = { localStorage: { getItem() { throw new Error('blocked'); } }, document: { documentElement: { setAttribute(_name, mode) { assert.equal(mode, 'off'); } }, addEventListener() {} } };
  assert.doesNotThrow(() => runInNewContext(script, context));
});

test('Settings uses one labelled native radio group and persists changes', async t => {
  storage(t);
  const fixture = await render(t, AccessibilitySettings);
  const fieldset = fixture.nativeElement.querySelector('fieldset');
  assert.equal(fieldset.querySelector('legend').textContent.trim(), 'Colour-blind mode');
  const radios = [...fieldset.querySelectorAll('input[type=radio]')];
  assert.deepEqual(radios.map(radio => radio.value), ['off', 'red-green', 'blue-yellow']);
  assert.ok(radios[0].checked);
  radios[2].checked = true;
  radios[2].dispatchEvent(new browser.Event('change', { bubbles: true }));
  fixture.detectChanges();
  assert.equal(fixture.componentInstance.colours.mode(), 'blue-yellow');
  assert.equal(document.documentElement.dataset.colourMode, 'blue-yellow');
});

test('Canvas resolves token colours and releases its theme observer', async t => {
  storage(t);
  const root = document.documentElement;
  root.style.setProperty('--sample-colour', '#abcdef');
  assert.equal(readThemeColour('--sample-colour'), '#abcdef');
  assert.deepEqual(readThemeRgb('--sample-colour'), [171, 205, 239]);
  root.style.setProperty('--sample-colour', 'rgb(5, 6, 7)');
  assert.deepEqual(readThemeRgb('--sample-colour'), [5, 6, 7]);
  root.style.setProperty('--sample-colour', '#abc');
  assert.deepEqual(readThemeRgb('--sample-colour'), [170, 187, 204]);
  assert.equal(readThemeColour('--sample-colour', null), '');
  let paints = 0;
  const stop = observeColourMode(() => paints++);
  applyColourMode('red-green');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(paints, 1);
  stop();
  applyColourMode('blue-yellow');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(paints, 1);
  root.style.removeProperty('--sample-colour');
});

test('component styles, templates and SVGs contain no literal palette colours', () => {
  const visit = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? visit(url) : /\.(scss|css|html|ts)$/.test(entry.name) ? [url] : [];
  });
  for (const file of visit(new URL('../src/', import.meta.url))) {
    const source = readFileSync(file, 'utf8');
    const values = [];
    if (file.pathname.endsWith('.ts')) {
      const tree = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true);
      const visit = node => {
        if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) values.push(node.getText(tree));
        else ts.forEachChild(node, visit);
      };
      visit(tree);
    } else values.push(source);
    for (const value of values) {
      assert.doesNotMatch(value, /var\(\s*--var\(/, `Invalid nested colour reference: ${file.pathname}`);
      assert.doesNotMatch(value, /#[\da-f]{3,8}(?![\w-])/i, file.pathname);
      assert.doesNotMatch(value, /\brgba?\(\s*\d/i, file.pathname);
    }
  }
});
