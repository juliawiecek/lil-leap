import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { render, browser } from './dom-helper.mjs';
const {
  GLOSSARY, NO_GLOSSARY, glossaryEntry, glossaryFor, glossaryHelp, glossaryHint, glossaryTarget, isGlossaryShortcut, listenForGlossary,
} = await import('../src/app/glossary.ts');
const { KEYBOARD_SHORTCUTS, KeyboardShortcuts } = await import('../src/app/keyboard-shortcuts.ts');
const { CaptionService } = await import('../src/app/captions.ts');
const { speechCoordinator } = await import('../../shared/speech-coordinator.ts');

const doc = browser.document;
const template = (file) => readFileSync(new URL(`../src/app/${file}`, import.meta.url), 'utf8');

test('every term from the story has a plain-English entry', () => {
  const keys = ['limit-price', 'market-order', 'time-in-force', 'take-profit', 'stop-loss', 'price-protection', 'buying-power',
    'bid-ask', 'order-book', 'volume', 'rsi', 'ema', 'vwap', 'total-return', 'average-cost'];
  assert.deepEqual(Object.keys(GLOSSARY).sort(), [...keys].sort());
  for (const key of keys) {
    const { term, definition } = glossaryEntry(key);
    assert.ok(term && definition.endsWith('.'), key);
    // Plain language: short sentences, no unexplained jargon words.
    for (const sentence of definition.split(/(?<=\.) /)) {
      assert.ok(sentence.split(' ').length <= 25, `${key}: "${sentence}" is short`);
    }
    assert.doesNotMatch(definition, /\b(execute|liquidity|instrument|denominated|notional)\b/i, key);
  }
  assert.match(GLOSSARY['time-in-force'].definition, /Day .* Good till cancelled, or GTC/);
  assert.equal(glossaryEntry('toString'), null, 'only real entries');
  assert.equal(glossaryEntry(null), null);
});

test('an element is explained by its own data-glossary or the nearest one around it', () => {
  doc.body.innerHTML = `
    <div data-glossary="buying-power"><span id="label">Buying power</span><strong>$1,000</strong></div>
    <div data-glossary="price-protection"><button id="change">Change for this order</button></div>
    <button id="plain">Settings</button>
    <p data-glossary="not-a-term" id="unknown">?</p>`;
  assert.equal(glossaryFor(doc.getElementById('label')).term, 'Buying power');
  assert.equal(glossaryHelp(doc.getElementById('change')), `Price protection. ${GLOSSARY['price-protection'].definition}`);
  assert.equal(glossaryHelp(doc.getElementById('plain')), NO_GLOSSARY);
  assert.equal(glossaryHelp(doc.getElementById('unknown')), 'No extra help for this item.');
  assert.equal(glossaryHelp(null), NO_GLOSSARY);
  doc.body.innerHTML = '';
});

test("voice mode's Detailed level gets the explanation alone, and nothing for an item without one (PS-22)", () => {
  doc.body.innerHTML = '<div data-glossary="volume"><svg id="bars"></svg></div><button id="plain">Settings</button>';
  assert.equal(glossaryHint(doc.getElementById('bars')), GLOSSARY.volume.definition);
  assert.equal(glossaryHint(doc.getElementById('plain')), '');
  doc.body.innerHTML = '';
});

test('Alt+W is the shortcut, also by physical key on a Mac, and is listed once with the others', () => {
  const key = (init) => new browser.KeyboardEvent('keydown', init);
  assert.equal(isGlossaryShortcut(key({ key: 'w', altKey: true })), true);
  assert.equal(isGlossaryShortcut(key({ key: '∑', code: 'KeyW', altKey: true })), true);
  assert.equal(isGlossaryShortcut(key({ key: 'w', altKey: true, ctrlKey: true })), false, 'Ctrl+W closes the tab; never taken');
  assert.equal(isGlossaryShortcut(key({ key: 'w', altKey: true, metaKey: true })), false);
  assert.equal(isGlossaryShortcut(key({ key: 'W', altKey: true, shiftKey: true })), false, 'Alt+Shift is read-aloud\'s');
  assert.equal(isGlossaryShortcut(key({ key: 'w' })), false);
  const taken = KEYBOARD_SHORTCUTS.flatMap((s) => s.keys);
  assert.ok(taken.includes('Alt + W'));
  assert.equal(taken.filter((k) => k === 'Alt + W').length, 1);
});

test('the Keyboard Shortcuts dialog on both dashboards lists Alt+W', async (t) => {
  for (const file of ['novice-dashboard.html', 'advanced-dashboard.html']) {
    assert.match(template(file), /<app-keyboard-shortcuts \/>/, file);
  }
  const fixture = await render(t, KeyboardShortcuts);
  const row = [...fixture.nativeElement.querySelectorAll('.shortcut-list > div')].find((r) => r.textContent.includes('Alt + W'));
  assert.match(row.textContent, /What's this\? Explains the focused item/);
});

test('the ringed item wins, then the focused control, then the item under the mouse', () => {
  doc.body.innerHTML = `
    <button id="ringed" data-glossary="volume">Volume</button>
    <button id="focused">Quantity</button>
    <div id="hovered" data-glossary="average-cost">Avg. price</div>`;
  const [ringed, focused, hovered] = ['ringed', 'focused', 'hovered'].map((id) => doc.getElementById(id));
  focused.focus();
  assert.equal(glossaryTarget(doc, ringed, hovered), ringed);
  assert.equal(glossaryTarget(doc, null, hovered), hovered, 'focus without help gives way to the hovered term');
  assert.equal(glossaryTarget(doc, null, null), focused, 'nothing with help: the focused item, which has none');
  focused.blur();
  assert.equal(glossaryTarget(doc, null, null), null);
  doc.body.innerHTML = '';
});

test('pressing Alt+W says the explanation of the item; other keys are left alone', (t) => {
  doc.body.innerHTML = '<div data-glossary="buying-power"><button id="bp">Buying power</button></div><button id="other">Other</button>';
  const said = [];
  let ringed = null;
  const stop = listenForGlossary(doc, () => ringed, (text) => said.push(text));
  t.after(() => { stop(); doc.body.innerHTML = ''; });
  const altW = (init = {}) => {
    const event = new browser.KeyboardEvent('keydown', { key: 'w', altKey: true, bubbles: true, cancelable: true, ...init });
    doc.body.dispatchEvent(event);
    return event;
  };
  doc.getElementById('bp').focus();
  assert.equal(altW().defaultPrevented, true);
  assert.deepEqual(said, [`Buying power. ${GLOSSARY['buying-power'].definition}`]);
  assert.equal(altW({ repeat: true }).defaultPrevented, true, 'holding the keys down types nothing');
  assert.equal(said.length, 1, 'and does not repeat the explanation');
  ringed = doc.getElementById('other');
  altW();
  assert.equal(said.at(-1), NO_GLOSSARY, 'the ring is on an item without help');
  ringed = null;
  doc.getElementById('bp').blur();
  doc.getElementById('other').dispatchEvent(new browser.MouseEvent('mouseover', { bubbles: true }));
  doc.getElementById('bp').dispatchEvent(new browser.MouseEvent('mouseover', { bubbles: true }));
  altW();
  assert.match(said.at(-1), /^Buying power\./, 'the item under the mouse');
  doc.body.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'b', altKey: true, bubbles: true }));
  assert.equal(said.length, 3, 'other keys are left alone');
  stop();
  altW();
  assert.equal(said.length, 3, 'no longer listening');
});

test('Alt+W speaks through the shared voice, cutting in, and is captioned', (t) => {
  const spoken = [];
  const before = { synth: globalThis.speechSynthesis, utterance: globalThis.SpeechSynthesisUtterance };
  globalThis.speechSynthesis = { speaking: false, paused: false, speak: (u) => spoken.push(u), cancel() {} };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const captions = new CaptionService();
  doc.body.innerHTML = '<button id="review" data-glossary="market-order">Review buy</button>';
  captions.start(doc);
  captions.setCaptions(true);
  const stop = listenForGlossary(doc);
  t.after(() => {
    stop(); captions.stop(); speechCoordinator.stop(); doc.body.innerHTML = '';
    globalThis.speechSynthesis = before.synth; globalThis.SpeechSynthesisUtterance = before.utterance;
  });
  const ring = new globalThis.SpeechSynthesisUtterance('Trade group');
  speechCoordinator.channel('switch').speak(ring);
  doc.getElementById('review').focus();
  doc.body.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'w', altKey: true, bubbles: true, cancelable: true }));
  assert.equal(spoken.at(-1).text, `Market order. ${GLOSSARY['market-order'].definition}`);
  assert.equal(speechCoordinator.owner, 'glossary', 'what was being said was cut off');
  assert.equal(doc.querySelector('.caption-strip').textContent, spoken.at(-1).text);
});

test('the terms are tagged where they appear on both dashboards, with real entries only', () => {
  const files = ['novice-dashboard.html', 'advanced-dashboard.html', 'advanced-ticket.html', 'technical-chart.html', 'quote-display.component.ts',
    'price-protection-settings.ts'];
  const used = new Set();
  for (const file of files) {
    for (const [, key] of template(file).matchAll(/data-glossary="([\w-]+)"/g)) {
      assert.ok(glossaryEntry(key), `${file}: ${key} has an entry`);
      used.add(key);
    }
  }
  for (const [, keys] of template('technical-chart.html').matchAll(/\[attr\.data-glossary\]="([^"]+)"/g)) {
    for (const [, key] of keys.matchAll(/[?:] '([\w-]+)'/g)) { assert.ok(glossaryEntry(key), key); used.add(key); }
  }
  const novice = template('novice-dashboard.html');
  const advanced = template('advanced-dashboard.html') + template('advanced-ticket.html');
  for (const key of ['buying-power', 'total-return', 'average-cost', 'price-protection', 'market-order']) {
    assert.ok(novice.includes(`data-glossary="${key}"`), `novice: ${key}`);
    assert.ok(advanced.includes(`data-glossary="${key}"`), `advanced: ${key}`);
  }
  for (const key of ['volume', 'rsi', 'ema', 'vwap', 'bid-ask']) assert.ok(used.has(key), key);
});
