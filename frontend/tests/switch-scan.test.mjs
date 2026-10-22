import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, browser } from './dom-helper.mjs';
const {
  ScanEngine, SwitchScanService, isSwitchControlShortcut, isSwitchKey, parseScanSettings, ringTarget, scanLabel, screenBox,
} = await import('../src/app/switch-scan.ts');
const { ACCESSIBILITY_STORAGE_KEY } = await import('../src/app/accessibility.ts');
const { SwitchScanSettings } = await import('../src/app/switch-scan-settings.ts');

const doc = browser.document;
const PAGE = `
  <nav data-scan-group="Menu"><button>Home</button><button>Orders</button></nav>
  <section data-scan-group="Trade">
    <button id="buy">Buy</button>
    <label for="qty">Number of shares</label><input id="qty" type="number" />
    <select id="sym" aria-label="Stock"><option value="AAPL">AAPL</option><option value="MSFT">MSFT</option></select>
    <input id="search" aria-label="Search" />
  </section>
  <div data-scan-group="Lonely"><button id="solo">Solo</button></div>
  <div data-scan-group="Empty"><span>Nothing to press</span></div>
  <button id="off" disabled>Disabled</button>
  <div data-scan-ignore><button>Ignored</button></div>
  <dialog id="dlg"><button id="close">Close</button><button id="ok">OK</button></dialog>
`;

/** A fresh page and an engine that only moves when the test says so. */
function setup(t, options = {}) {
  doc.body.innerHTML = PAGE;
  const engine = new ScanEngine(doc, { isVisible: () => true, autoAdvance: false, ...options });
  engine.start();
  t.after(() => { engine.stop(); doc.body.innerHTML = ''; });
  return engine;
}

const describe = (item) => (item.kind === 'back' || item.kind === 'pause' ? item.kind : `${item.kind}:${scanLabel(item.el)}`);

/** Moves the ring forward until it is on the item described, as a waiting switch user would. */
function waitFor(engine, wanted) {
  for (let i = 0; i < 40; i++) {
    if (describe(engine.current()) === wanted) return;
    engine.next();
  }
  throw new Error(`Never reached ${wanted}; at ${describe(engine.current())}`);
}

function choose(engine, ...path) {
  for (const step of path) {
    waitFor(engine, step);
    engine.press();
  }
}

test('settings fall back to safe defaults', () => {
  const defaults = { enabled: false, intervalMs: 1200, key: 'Space', speak: false, backEverySec: 30, pauseEverySec: 120 };
  assert.deepEqual(parseScanSettings(undefined), defaults);
  assert.deepEqual(parseScanSettings('text'), defaults);
  assert.deepEqual(
    parseScanSettings({ enabled: true, intervalMs: 2000, key: 'Enter', speak: true, backEverySec: 0, pauseEverySec: 300 }),
    { enabled: true, intervalMs: 2000, key: 'Enter', speak: true, backEverySec: 0, pauseEverySec: 300 },
  );
  assert.deepEqual(
    parseScanSettings({ enabled: 'yes', intervalMs: 5, key: 'Tab', speak: 'yes', backEverySec: 7, pauseEverySec: -1 }),
    defaults,
  );
});

/** A speech engine stand-in that records what the ring says; nothing finishes until the test says so. */
function withSpeech(t, speaking = false) {
  const spoken = [];
  const synth = { speaking, speak: (u) => spoken.push(u), cancel: () => { synth.cancelled += 1; }, cancelled: 0 };
  class Utterance { constructor(text) { this.text = text; } }
  const before = { synth: globalThis.speechSynthesis, utterance: globalThis.SpeechSynthesisUtterance };
  globalThis.speechSynthesis = synth;
  globalThis.SpeechSynthesisUtterance = Utterance;
  t.after(() => {
    globalThis.speechSynthesis = before.synth;
    globalThis.SpeechSynthesisUtterance = before.utterance;
  });
  return { said: () => spoken.map((u) => u.text), spoken, synth };
}

test('reading aloud says each item as the ring reaches it, once, with its state or value', (t) => {
  const { said, synth } = withSpeech(t);
  doc.body.innerHTML = '';
  const engine = setup(t, { speak: true });
  assert.deepEqual(said(), ['Switch control on. Press the space bar to choose.', 'Menu group']);
  engine.next();
  assert.equal(said().at(-1), 'Trade group');
  assert.equal(synth.cancelled, 1, 'moving on cuts off the item before');
  doc.getElementById('buy').setAttribute('aria-pressed', 'true');
  doc.getElementById('qty').value = '5';
  engine.press();
  assert.deepEqual(said().slice(-2), ['Trade, 4 items.', 'Buy, selected']);
  assert.equal(synth.cancelled, 2, 'the first item waits for the announcement instead of cutting it off');
  engine.next();
  assert.equal(said().at(-1), 'Number of shares, 5');
  const count = said().length;
  engine.press();
  engine.next();
  assert.ok(said().length > count, 'the keypad is read out too');
});

test('inside a group, "Go back?" is offered every 30 seconds wherever the ring is, and pressing backs out', (t) => {
  const { said } = withSpeech(t);
  const engine = setup(t, { speak: true, backEveryMs: 30000, pauseEveryMs: 0 });
  const start = Date.now();
  engine.next(start + 31000);
  assert.equal(engine.prompt, null, 'never offered at the top level, where there is nothing to go back to');
  choose(engine, 'group:Trade');
  engine.next(start + 1000);
  assert.equal(describe(engine.current()), 'control:Number of shares');
  engine.next(start + 32000);
  assert.equal(engine.prompt, 'back');
  assert.equal(said().at(-1), 'Go back? Press space now.');
  assert.match(doc.querySelector('.scan-chip').textContent, /Go back\? Press space now/);
  engine.press();
  assert.equal(engine.prompt, null);
  assert.equal(engine.depth, 1, 'backed out of Trade');
  assert.equal(describe(engine.current()), 'group:Trade');
});

test('an unanswered offer gives way after one step, and the ring carries on with the next item', (t) => {
  const engine = setup(t, { backEveryMs: 30000, pauseEveryMs: 0 });
  choose(engine, 'group:Trade');
  assert.equal(describe(engine.current()), 'control:Buy');
  engine.next(Date.now() + 31000);
  assert.equal(engine.prompt, 'back');
  assert.equal(describe(engine.current()), 'control:Buy', 'the offer shows in place of a step');
  engine.next(Date.now() + 31500);
  assert.equal(engine.prompt, null);
  assert.equal(describe(engine.current()), 'control:Number of shares', 'on to the next item, so a long item is never re-read in a loop');
  engine.next(Date.now() + 32000);
  assert.equal(engine.prompt, null, 'not offered again until another 30 seconds pass');
});

test('"Pause switch control?" is offered on its own interval and pauses when pressed; 0 turns offers off', (t) => {
  const { said } = withSpeech(t);
  const engine = setup(t, { speak: true, backEveryMs: 0, pauseEveryMs: 120000 });
  engine.next(Date.now() + 121000);
  assert.equal(engine.prompt, 'pause');
  assert.equal(said().at(-1), 'Pause switch control? Press space now.');
  engine.press();
  assert.equal(engine.paused, true);
  doc.body.innerHTML = '';
  const quiet = setup(t, { backEveryMs: 0, pauseEveryMs: 0 });
  choose(quiet, 'group:Trade');
  quiet.next(Date.now() + 10 * 60000);
  assert.equal(quiet.prompt, null);
});

test('a settings toggle is ringed with the row it labels, so the ring never sits on a lone dot', () => {
  doc.body.innerHTML = `
    <div id="row"><span>Show portfolio balance</span><button role="switch" aria-label="Show portfolio balance"></button></div>
    <label id="check"><input type="checkbox" /> Read each item aloud</label>
    <div id="seg"><button id="one">1%</button><button>2%</button></div>`;
  assert.equal(ringTarget(doc.querySelector('[role="switch"]')).id, 'row');
  assert.equal(ringTarget(doc.querySelector('input')).id, 'check');
  assert.equal(ringTarget(doc.getElementById('one')).id, 'one', 'a button with its own text keeps its own ring');
  doc.body.innerHTML = '';
});

test('an item redrawn under the ring (live prices) is not read out again', (t) => {
  const { said } = withSpeech(t);
  const engine = setup(t, { speak: true });
  choose(engine, 'group:Trade');
  doc.getElementById('buy').addEventListener('click', () => {
    doc.getElementById('buy').outerHTML = '<button id="buy">Buy</button>';
  });
  waitFor(engine, 'control:Buy');
  const before = said().length;
  engine.press();
  assert.deepEqual(said().slice(before), ['Buy selected.'], 'the redrawn Buy is the same item, so it is not repeated');
});

test('the page can speak through the ring, after what the ring is saying', (t) => {
  const { said, synth } = withSpeech(t);
  const engine = setup(t, { speak: true });
  const cancels = synth.cancelled;
  engine.say('1 day. Now you have $25,000.00, unchanged.');
  assert.equal(said().at(-1), '1 day. Now you have $25,000.00, unchanged.');
  assert.equal(synth.cancelled, cancels, 'queued, not cutting the ring off');
  assert.equal(doc.querySelector('.scan-live').textContent, '1 day. Now you have $25,000.00, unchanged.');
  engine.say("You're about to buy 2 shares of Apple for $374.", true);
  assert.equal(synth.cancelled, cancels + 1, 'an order read-back cuts in');
  assert.equal(said().at(-1), "You're about to buy 2 shares of Apple for $374.");
});

test('Alt+S turns switch control on with reading aloud from any page, and off again', (t) => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
  });
  const { said } = withSpeech(t);
  const service = new SwitchScanService();
  const stop = service.listenForShortcut(doc);
  t.after(() => {
    stop();
    service.update({ enabled: false });
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
    doc.body.innerHTML = '';
  });
  const altS = () => {
    const event = new browser.KeyboardEvent('keydown', { key: 's', altKey: true, bubbles: true, cancelable: true });
    doc.body.dispatchEvent(event);
    return event;
  };
  assert.equal(isSwitchControlShortcut(new browser.KeyboardEvent('keydown', { key: 's', altKey: true, ctrlKey: true })), false);
  assert.equal(altS().defaultPrevented, true);
  assert.equal(service.settings().enabled, true);
  assert.equal(service.settings().speak, true, 'turned on by keyboard, so items are read aloud');
  assert.equal(service.engine.running, true);
  assert.match(said()[0], /^Switch control on/);
  service.announce('Chart summary.');
  assert.equal(said().at(-1), 'Chart summary.');
  altS();
  assert.equal(service.settings().enabled, false);
  assert.equal(service.engine, null);
  assert.equal(said().at(-1), 'Switch control off.');
  stop();
  altS();
  assert.equal(service.settings().enabled, false, 'no longer listening once stopped');
});

test('with reading aloud off, or while the briefing talks, the ring stays quiet', (t) => {
  const quiet = withSpeech(t);
  setup(t).next();
  assert.deepEqual(quiet.said(), []);
  doc.body.innerHTML = '';
  const busy = withSpeech(t, true);
  const engine = setup(t, { speak: true });
  engine.next();
  assert.deepEqual(busy.said(), [], 'another voice is speaking, so the ring does not cut it off');
});

test('the timer waits for the ring to finish reading, but never stalls on a stuck speech engine', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  t.after(() => t.mock.timers.reset());
  const { spoken } = withSpeech(t);
  const engine = setup(t, { autoAdvance: true, intervalMs: 700, speak: true });
  t.mock.timers.tick(700);
  assert.equal(describe(engine.current()), 'group:Menu', 'still reading');
  spoken.at(-1).onend();
  t.mock.timers.tick(700);
  assert.equal(describe(engine.current()), 'group:Trade');
  t.mock.timers.tick(9100);
  assert.notEqual(describe(engine.current()), 'group:Trade', 'moves on after the speech wait runs out');
});

test('the switch key is Space or Enter', () => {
  assert.equal(isSwitchKey(new browser.KeyboardEvent('keydown', { code: 'Space', key: ' ' }), 'Space'), true);
  assert.equal(isSwitchKey(new browser.KeyboardEvent('keydown', { key: 'Enter' }), 'Space'), false);
  assert.equal(isSwitchKey(new browser.KeyboardEvent('keydown', { key: 'Enter' }), 'Enter'), true);
});

test('the top level lists groups, lone controls and a pause item, skipping what cannot be used', (t) => {
  const engine = setup(t);
  assert.deepEqual(engine.items().map(describe), ['group:Menu', 'group:Trade', 'control:Solo', 'pause']);
  assert.ok(doc.querySelector('.scan-ring'));
  assert.match(doc.querySelector('.scan-bar').textContent, /Space bar selects/);
});

test('choosing a group scans inside it, ending with Back', (t) => {
  const engine = setup(t);
  choose(engine, 'group:Trade');
  assert.equal(engine.depth, 2);
  assert.deepEqual(engine.items().map(describe), [
    'control:Buy', 'control:Number of shares', 'control:Stock', 'control:Search', 'back',
  ]);
  choose(engine, 'back');
  assert.equal(engine.depth, 1);
  assert.equal(describe(engine.current()), 'group:Trade', 'returns to the group it left');
});

test('two unanswered passes through a group step back out of it', (t) => {
  const engine = setup(t);
  choose(engine, 'group:Menu');
  for (let i = 0; i < 6; i++) engine.next();
  assert.equal(engine.depth, 1);
});

test('choosing a button clicks it and focus follows the ring', (t) => {
  const engine = setup(t);
  let clicks = 0;
  doc.getElementById('buy').addEventListener('click', () => clicks++);
  choose(engine, 'group:Trade');
  waitFor(engine, 'control:Buy');
  assert.equal(doc.activeElement, doc.getElementById('buy'));
  engine.press();
  assert.equal(clicks, 1);
  assert.equal(engine.depth, 2, 'stays in the group for the next step');
});

test('when the page re-renders (a route change), scanning stays in the same group and spot', (t) => {
  const engine = setup(t);
  choose(engine, 'group:Menu');
  waitFor(engine, 'control:Orders');
  doc.querySelector('nav').querySelectorAll('button')[1].addEventListener('click', () => {
    doc.querySelector('nav').outerHTML = '<nav data-scan-group="Menu"><button>Home</button><button>Orders</button></nav>';
  });
  engine.press();
  assert.equal(engine.depth, 2, 'still inside Menu');
  assert.equal(describe(engine.current()), 'control:Orders');
  assert.ok(engine.current().el.isConnected, 'on the new button, not the removed one');
  engine.next();
  assert.equal(describe(engine.current()), 'back');
});

test('a number field opens a keypad that types into it and fires the events the dashboards use', (t) => {
  const engine = setup(t);
  const qty = doc.getElementById('qty');
  const seen = [];
  qty.addEventListener('input', () => seen.push(`input:${qty.value}`));
  qty.addEventListener('change', () => seen.push(`change:${qty.value}`));
  choose(engine, 'group:Trade', 'control:Number of shares');
  assert.equal(engine.pickerOpen, true);
  assert.ok(engine.items().every((item) => item.kind === 'group'), 'the pad is scanned row by row');
  choose(engine, 'group:1 to 3', 'control:2');
  choose(engine, 'group:. to ⌫', 'control:0');
  choose(engine, 'group:. to ⌫', 'control:Delete');
  choose(engine, 'group:4 to 6', 'control:5');
  assert.equal(doc.querySelector('.scan-pad-value').textContent, '25');
  choose(engine, 'group:Done or cancel', 'control:Done');
  assert.equal(engine.pickerOpen, false);
  assert.equal(doc.querySelector('.scan-pad'), null);
  assert.equal(qty.value, '25');
  assert.deepEqual(seen, ['input:2', 'input:20', 'input:2', 'input:25', 'input:25', 'change:25']);
  assert.equal(engine.depth, 2, 'back in the Trade group');
  assert.equal(describe(engine.current()), 'control:Number of shares', 'the ring picks up where it left off');
});

test('cancelling a keypad puts the old value back', (t) => {
  const engine = setup(t);
  const qty = doc.getElementById('qty');
  qty.value = '7';
  choose(engine, 'group:Trade', 'control:Number of shares', 'group:1 to 3', 'control:1');
  assert.equal(qty.value, '1', 'the first key replaces a filled-in value, like a selected field');
  choose(engine, 'group:1 to 3', 'control:2');
  assert.equal(qty.value, '12');
  choose(engine, 'group:Done or cancel', 'control:Cancel');
  assert.equal(qty.value, '7');
});

test('a text field gets a letter keypad', (t) => {
  const engine = setup(t);
  const search = doc.getElementById('search');
  choose(engine, 'group:Trade', 'control:Search', 'group:A to F', 'control:A', 'group:Y to ⌫', 'control:Space');
  assert.equal(search.value, 'a ');
});

test('a dropdown opens its options as a scanned list', (t) => {
  const engine = setup(t);
  const select = doc.getElementById('sym');
  let changed = '';
  select.addEventListener('change', () => { changed = select.value; });
  choose(engine, 'group:Trade', 'control:Stock', 'group:AAPL to MSFT', 'control:MSFT');
  assert.equal(changed, 'MSFT');
  assert.equal(engine.pickerOpen, false);
});

test('an open dialog becomes the whole scan, and the ring moves inside it', (t) => {
  const engine = setup(t);
  const dialog = doc.getElementById('dlg');
  dialog.showModal();
  assert.deepEqual(engine.items().map(describe), ['control:Close', 'control:OK', 'pause']);
  engine.next();
  assert.equal(doc.querySelector('.scan-ring').parentElement, dialog);
  dialog.close();
  assert.deepEqual(engine.items().map(describe), ['group:Menu', 'group:Trade', 'control:Solo', 'pause']);
});

test('pausing stops the ring until the switch is pressed again', (t) => {
  const engine = setup(t);
  choose(engine, 'pause');
  assert.equal(engine.paused, true);
  assert.equal(doc.querySelector('.scan-ring').hidden, true);
  engine.next();
  assert.equal(engine.paused, true);
  engine.press();
  assert.equal(engine.paused, false);
  assert.equal(describe(engine.current()), 'group:Menu');
});

test('the switch key presses without typing, and still counts as activity for the session', (t) => {
  const engine = setup(t);
  let activity = 0;
  const onKey = () => activity++;
  doc.addEventListener('keydown', onKey);
  t.after(() => doc.removeEventListener('keydown', onKey));
  const press = new browser.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
  doc.body.dispatchEvent(press);
  assert.equal(press.defaultPrevented, true);
  assert.equal(engine.depth, 2, 'the first press opened the Menu group');
  assert.equal(activity, 1);
  const release = new browser.KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
  doc.body.dispatchEvent(release);
  assert.equal(release.defaultPrevented, true);
  const other = new browser.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
  doc.body.dispatchEvent(other);
  assert.equal(other.defaultPrevented, false);
});

test('stopping removes everything the engine drew', (t) => {
  const engine = setup(t);
  choose(engine, 'group:Trade', 'control:Number of shares');
  engine.stop();
  assert.equal(engine.running, false);
  for (const selector of ['.scan-ring', '.scan-chip', '.scan-bar', '.scan-pad', '.scan-live']) {
    assert.equal(doc.querySelector(selector), null, selector);
  }
});

test('the timer moves the ring on its own at the chosen speed', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const engine = setup(t, { autoAdvance: true, intervalMs: 700 });
  t.after(() => t.mock.timers.reset());
  assert.equal(describe(engine.current()), 'group:Menu');
  t.mock.timers.tick(700);
  assert.equal(describe(engine.current()), 'group:Trade');
});

test('the service saves settings and starts or stops the engine', (t) => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
    doc.body.innerHTML = '';
  });
  const service = new SwitchScanService();
  assert.equal(service.engine, null);
  service.update({ enabled: true, intervalMs: 2000 });
  assert.equal(service.engine.running, true);
  assert.equal(service.engine.intervalMs, 2000);
  assert.deepEqual(JSON.parse(values.get(ACCESSIBILITY_STORAGE_KEY)).switchControl, {
    enabled: true, intervalMs: 2000, key: 'Space', speak: false, backEverySec: 30, pauseEverySec: 120,
  });
  service.update({ speak: true });
  assert.equal(service.engine.speak, true, 'reading aloud turns on without restarting');
  const first = service.engine;
  service.update({ key: 'Enter' });
  assert.notEqual(service.engine, first, 'a new key restarts the engine');
  assert.equal(first.running, false);
  doc.querySelector('.scan-bar button').click();
  assert.equal(service.engine, null, 'the status bar can turn it off');
  assert.equal(service.settings().enabled, false);
  values.set(ACCESSIBILITY_STORAGE_KEY, JSON.stringify({ switchControl: { enabled: true } }));
  const restored = new SwitchScanService();
  assert.equal(restored.engine.running, true, 'turned on again after a reload');
  restored.update({ enabled: false });
});

test('the settings card toggles switch control and its options', async (t) => {
  const calls = [];
  const fake = {
    settings: () => ({ enabled: false, intervalMs: 1200, key: 'Space', speak: false, backEverySec: 30, pauseEverySec: 120 }),
    update: (c) => calls.push(c),
  };
  const fixture = await render(t, SwitchScanSettings, {}, [{ provide: SwitchScanService, useValue: fake }]);
  const root = fixture.nativeElement;
  const toggle = root.querySelector('.scan-toggle');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  toggle.click();
  const [speed, key, back, pause] = root.querySelectorAll('select');
  speed.value = '2000'; speed.dispatchEvent(new browser.Event('change'));
  key.value = 'Enter'; key.dispatchEvent(new browser.Event('change'));
  assert.equal(back.value, '30');
  back.value = '60'; back.dispatchEvent(new browser.Event('change'));
  pause.value = '0'; pause.dispatchEvent(new browser.Event('change'));
  const speak = root.querySelector('input[type="checkbox"]');
  assert.equal(speak.checked, false);
  speak.checked = true; speak.dispatchEvent(new browser.Event('change'));
  assert.deepEqual(calls, [
    { enabled: true }, { intervalMs: 2000 }, { key: 'Enter' }, { backEverySec: 60 }, { pauseEverySec: 0 }, { speak: true },
  ]);
});

test('a component host drawn with display: contents counts as visible through its children', (t) => {
  doc.body.innerHTML = '<app-ticket data-scan-group="Ticket" style="display: contents"><button>A</button><button>B</button></app-ticket><button>C</button>';
  const engine = new ScanEngine(doc, { autoAdvance: false, isVisible: (el) => el.tagName !== 'APP-TICKET' || el.children.length > 0 });
  engine.start();
  t.after(() => { engine.stop(); doc.body.innerHTML = ''; });
  assert.deepEqual(engine.items().map(describe), ['group:Ticket', 'control:C', 'pause']);
  const box = screenBox(doc.querySelector('app-ticket'));
  assert.equal(typeof box.width, 'number');
});
