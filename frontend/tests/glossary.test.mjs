import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
const {
  GLOSSARY, LEARN_GLOSSARY, NO_GLOSSARY, glossaryEntry, glossaryFor, glossaryHelp, glossaryTarget, isGlossaryShortcut, listenForGlossary,
} = await import('../src/app/glossary.ts');
const { KEYBOARD_SHORTCUTS } = await import('../src/app/keyboard-shortcuts.ts');
const { NoviceLearn } = await import('../src/app/novice-learn.ts');

const doc = browser.document;

test('every term from the story has a plain-English entry', () => {
  const keys = ['limit-price', 'market-order', 'time-in-force', 'take-profit', 'stop-loss', 'price-protection', 'buying-power',
    'bid-ask', 'order-book', 'volume', 'rsi', 'ema', 'vwap', 'total-return', 'average-cost'];
  for (const key of keys) {
    const entry = glossaryEntry(key);
    assert.ok(entry?.term && entry.definition.endsWith('.'), key);
  }
  assert.match(GLOSSARY['time-in-force'].definition, /Day .* Good till cancelled/);
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

test('Alt+W is the shortcut, also by physical key on a Mac, and is listed with the others', () => {
  const key = (init) => new browser.KeyboardEvent('keydown', init);
  assert.equal(isGlossaryShortcut(key({ key: 'w', altKey: true })), true);
  assert.equal(isGlossaryShortcut(key({ key: '∑', code: 'KeyW', altKey: true })), true);
  assert.equal(isGlossaryShortcut(key({ key: 'w', altKey: true, ctrlKey: true })), false);
  assert.equal(isGlossaryShortcut(key({ key: 'w' })), false);
  const taken = KEYBOARD_SHORTCUTS.flatMap((s) => s.keys);
  assert.ok(taken.includes('Alt + W'));
  assert.equal(new Set(taken).size, taken.length, 'no two shortcuts share keys');
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

test('pressing Alt+W says and captions the explanation, cutting in', (t) => {
  doc.body.innerHTML = '<div data-glossary="buying-power"><button id="bp">Buying power</button></div><button id="other">Other</button>';
  const said = [];
  const speech = { speak: (text, options) => said.push([text, options]) };
  let ringed = null;
  const stop = listenForGlossary(doc, speech, () => ringed);
  t.after(() => { stop(); doc.body.innerHTML = ''; });
  const altW = () => {
    const event = new browser.KeyboardEvent('keydown', { key: 'w', altKey: true, bubbles: true, cancelable: true });
    doc.body.dispatchEvent(event);
    return event;
  };
  doc.getElementById('bp').focus();
  assert.equal(altW().defaultPrevented, true);
  assert.deepEqual(said.at(-1), [`Buying power. ${GLOSSARY['buying-power'].definition}`, { priority: 'urgent', source: 'glossary' }]);
  ringed = doc.getElementById('other');
  altW();
  assert.equal(said.at(-1)[0], NO_GLOSSARY, 'the ring is on an item without help');
  ringed = null;
  doc.getElementById('bp').blur();
  doc.getElementById('other').dispatchEvent(new browser.MouseEvent('mouseover', { bubbles: true }));
  doc.getElementById('bp').dispatchEvent(new browser.MouseEvent('mouseover', { bubbles: true }));
  altW();
  assert.match(said.at(-1)[0], /^Buying power\./, 'the item under the mouse');
  doc.body.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'b', altKey: true, bubbles: true }));
  assert.equal(said.length, 3, 'other keys are left alone');
  stop();
  altW();
  assert.equal(said.length, 3, 'no longer listening');
});

test('the Learn hub explains words from the same glossary', (t) => {
  assert.ok(LEARN_GLOSSARY.includes(GLOSSARY['limit-price']));
  assert.ok(LEARN_GLOSSARY.every((entry) => entry.term && entry.definition));
  assert.equal(component(t, NoviceLearn).glossary, LEARN_GLOSSARY);
});
