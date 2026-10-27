import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser } from './dom-helper.mjs';
const { AssistiveController } = await import('../../shared/assistive-controller.ts');
const { parseAssistivePreferences, mergeAssistivePreferences, applyAssistiveVisuals } = await import('../../shared/assistive-preferences.ts');
const { describeElement } = await import('../../shared/accessible-description.ts');
const { SpeechCoordinator, speechCoordinator } = await import('../../shared/speech-coordinator.ts');

function setup(t, markup, patch = {}, scanning = false) {
  browser.document.body.innerHTML = markup;
  // Happy DOM has no layout engine. Model a vertical page unless a test supplies specific rectangles.
  [...browser.document.body.querySelectorAll('*')].forEach((element, index) => place(element, 0, index * 30));
  let preferences = { ...parseAssistivePreferences(patch, patch), ...patch };
  const spoken = [], statuses = [];
  const synth = { speaking: false, paused: false, cancelCount: 0,
    speak(utterance) { spoken.push(utterance); this.speaking = true; },
    cancel() { this.cancelCount++; this.speaking = false; },
    pause() { this.paused = true; }, resume() { this.paused = false; },
    getVoices: () => [{ name: 'Local', voiceURI: 'local', localService: true, default: true }],
  };
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: synth });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(text) { this.text = text; } } });
  const controller = new AssistiveController(browser.document, {
    settings: () => preferences, status: value => statuses.push(value), state() {}, voices() {}, scanning: () => scanning,
  });
  controller.start();
  t.after(() => { controller.destroy(); speechCoordinator.stop(); browser.document.body.innerHTML = ''; });
  return { controller, spoken, synth, statuses, doc: browser.document, update: patch => { preferences = { ...preferences, ...patch }; controller.apply(); } };
}
const key = (doc, name, options = {}) => doc.activeElement.dispatchEvent(new browser.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }));
const hover = (element, options = {}) => element.dispatchEvent(new browser.PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', ...options }));
function place(element, left, top, width = 100, height = 20) {
  element.getBoundingClientRect = () => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top });
}

test('preferences default off, reject corrupt values and preserve independent existing voice/visual choices', () => {
  const defaults = parseAssistivePreferences({ enabled: 'true', focus: 1, hover: 'yes', rate: Infinity, hoverDelay: 50, volume: -1 }, {});
  assert.equal(defaults.enabled, false); assert.equal(defaults.focus, false); assert.equal(defaults.hover, false);
  assert.equal(defaults.rate, 1); assert.equal(defaults.hoverDelay, 550); assert.equal(defaults.volume, 1);
  const merged = mergeAssistivePreferences({ chartSummaries: true, cues: false }, { anotherChoice: true }, { enabled: true, textSize: 'large' });
  assert.equal(merged.voice.chartSummaries, true); assert.equal(merged.voice.cues, false); assert.equal(merged.visual.anotherChoice, true);
  applyAssistiveVisuals(browser.document.documentElement, parseAssistivePreferences(merged.voice, merged.visual));
  assert.equal(browser.document.documentElement.getAttribute('data-a11y-text'), 'large');
  applyAssistiveVisuals(browser.document.documentElement, parseAssistivePreferences({}, {}));
  assert.equal(browser.document.documentElement.hasAttribute('data-a11y-text'), false);
});

test('descriptions include names, native roles, values and relevant states but never password values', () => {
  browser.document.body.innerHTML = '<label>Quantity<input type="number" required value="2" aria-invalid="true" aria-describedby="error"></label><p id="error">Enter a whole number.</p><label>Password<input type="text" autocomplete="current-password" value="secret-value"></label><button disabled aria-expanded="false">Review order</button>';
  const [quantity, password] = browser.document.querySelectorAll('input');
  // Fields are said as label and value first (PS-22); Detailed then adds the role and states.
  assert.match(describeElement(quantity), /^Quantity, 2\. number field\. Required\. Invalid entry\. Enter a whole number\.$/);
  assert.doesNotMatch(describeElement(password, true), /secret-value/);
  assert.match(describeElement(browser.document.querySelector('button')), /Review order.*button.*Unavailable.*Collapsed/);
  const metric = browser.document.createElement('div');
  metric.setAttribute('data-a11y-read', ''); metric.setAttribute('data-a11y-label', 'Total portfolio value'); metric.textContent = '$24,350.00';
  assert.match(describeElement(metric), /Total portfolio value.*\$24,350.00/);
});

test('automatic speech is silent by default and is not driven by market DOM updates', t => {
  const { doc, spoken } = setup(t, '<button>Buy Apple</button><p id="price">$200</p>');
  key(doc, 'Tab'); doc.querySelector('button').focus(); hover(doc.querySelector('button'));
  doc.querySelector('#price').textContent = '$201';
  assert.equal(spoken.length, 0);
});

test('focus speech debounces, replaces stale reading, does not activate controls and respects switch mode', t => {
  const { doc, spoken, synth } = setup(t, '<button>Portfolio</button><button>Buy Apple</button>', { enabled: true, focus: true });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const [first, second] = doc.querySelectorAll('button'); let clicks = 0; second.onclick = () => clicks++;
  key(doc, 'Tab'); first.focus(); t.mock.timers.tick(100); second.focus(); t.mock.timers.tick(180);
  // Brief is the default level: the name alone, no role (PS-22).
  assert.equal(spoken.length, 1); assert.equal(spoken[0].text, 'Buy Apple.'); assert.equal(clicks, 0);
  first.focus(); t.mock.timers.tick(180);
  assert.equal(spoken.length, 2); assert.ok(synth.cancelCount > 0);
});

test('focus/hover voice stays quiet while the existing scanner owns navigation', t => {
  const { doc, spoken } = setup(t, '<button>Portfolio</button>', { enabled: true, focus: true, hover: true }, true);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  key(doc, 'Tab'); doc.querySelector('button').focus(); hover(doc.querySelector('button')); t.mock.timers.tick(1000);
  assert.equal(spoken.length, 0);
});

test('hover requires dwell, cancels on leaving, ignores touch/private areas and does not repeat on ticks', t => {
  const { doc, spoken } = setup(t, '<button><span>Buy Apple</span></button><p data-a11y-sensitive>Account 1234</p>', { enabled: true, hover: true });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const button = doc.querySelector('button'); hover(button); t.mock.timers.tick(300);
  button.dispatchEvent(new browser.PointerEvent('pointerout', { bubbles: true })); t.mock.timers.tick(1000);
  assert.equal(spoken.length, 0);
  hover(button); t.mock.timers.tick(550); assert.equal(spoken.length, 1);
  hover(button.querySelector('span')); button.querySelector('span').textContent = 'Buy Apple $201'; t.mock.timers.tick(1000);
  assert.equal(spoken.length, 1);
  hover(doc.querySelector('p')); t.mock.timers.tick(1000); assert.equal(spoken.length, 1);
  hover(button, { pointerType: 'touch' }); t.mock.timers.tick(1000); assert.equal(spoken.length, 1);
});

test('on-demand reading works with continuous voice off; tools retain the last page target; stop/pause work', t => {
  const { doc, spoken, controller, synth } = setup(t, '<main><h1>Portfolio</h1><section><h2>Holdings</h2><button>Apple details</button></section></main><button data-a11y-reading-action>Read focused element</button>');
  doc.querySelector('section button').focus(); doc.querySelector('[data-a11y-reading-action]').focus();
  controller.readFocused(); assert.match(spoken.at(-1).text, /Apple details/);
  controller.pause(); assert.equal(synth.paused, true); controller.pause(); assert.equal(synth.paused, false);
  controller.readSection(); assert.match(spoken.at(-1).text, /Holdings.*Apple details/);
  controller.readPage(); assert.match(spoken.at(-1).text, /Portfolio.*Sections: Holdings/);
  controller.pause(); controller.stop(); assert.equal(synth.speaking, false); assert.equal(synth.paused, false);
});

test('tabs use arrows/Home/End without activating on focus; search arrows focus real result buttons', t => {
  const { doc } = setup(t, '<div role="tablist"><button role="tab" aria-selected="true">Overview</button><button role="tab">Orders</button></div><div data-a11y-search><input aria-label="Stock search"><div data-a11y-results><button>Apple</button><button>Microsoft</button></div></div>');
  const tabs = doc.querySelectorAll('[role=tab]'); let activated = 0; tabs[1].onclick = () => activated++;
  tabs[0].focus(); key(doc, 'ArrowRight'); assert.equal(doc.activeElement, tabs[1]); assert.equal(activated, 0);
  key(doc, 'Home'); assert.equal(doc.activeElement, tabs[0]); key(doc, 'End'); assert.equal(doc.activeElement, tabs[1]);
  const input = doc.querySelector('input'); input.focus(); key(doc, 'ArrowDown'); assert.equal(doc.activeElement.textContent, 'Apple');
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement.textContent, 'Microsoft'); key(doc, 'Home'); assert.equal(doc.activeElement.textContent, 'Apple');
  key(doc, 'ArrowUp'); assert.equal(doc.activeElement, input);
});

test('route focus follows page navigation, while query/data changes leave focus where the user put it', t => {
  const { doc, controller } = setup(t, '<button>Settings</button><main><h1>Settings</h1></main>');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  controller.routeChanged('/dashboard'); doc.querySelector('button').focus();
  controller.routeChanged('/settings'); t.mock.timers.tick(80); assert.equal(doc.activeElement.tagName, 'H1');
  doc.querySelector('button').focus(); controller.routeChanged('/settings?panel=voice'); t.mock.timers.tick(100);
  assert.equal(doc.activeElement.tagName, 'BUTTON');
});

test('shortcuts leave typing alone, stop is available while typing, and form errors are linked and focusable', t => {
  const { doc, controller, spoken } = setup(t, '<main><h1>Sign in</h1><form><label>Email<input type="email" required></label><button>Continue</button></form></main>');
  const input = doc.querySelector('input'), form = doc.querySelector('form'); input.focus();
  key(doc, 'r', { altKey: true, shiftKey: true }); assert.equal(spoken.length, 0);
  controller.readFocused(); key(doc, 'x', { altKey: true, shiftKey: true }); assert.equal(speechCoordinator.owner, '');
  form.dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.ok(doc.getElementById(input.getAttribute('aria-describedby'))?.textContent);
  assert.equal(doc.activeElement, input);
  input.value = 'person@example.com'; input.dispatchEvent(new browser.Event('input', { bubbles: true }));
  assert.equal(input.hasAttribute('aria-invalid'), false);
});

test('a form that validates itself keeps its own messages: the browser wording never replaces them (PS-21)', t => {
  const { doc } = setup(t, '<form novalidate data-a11y-app-validation><label>Quantity<input type="number" min="1" required value="0"></label><button>Review</button></form>');
  const input = doc.querySelector('input'), form = doc.querySelector('form');
  let handled = 0; form.addEventListener('submit', () => handled++);
  form.dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(handled, 1, "the app's own submit handler still runs");
  assert.equal(input.hasAttribute('aria-invalid'), false, 'the app, not the controller, marks the field');
  assert.equal(doc.querySelector('.a11y-field-error'), null);
  input.dispatchEvent(new browser.Event('invalid', { cancelable: true }));
  assert.equal(input.hasAttribute('aria-describedby'), false);
});

test('coordinator queues its channel, prevents passive overlap, configures local voice and releases cancellation callbacks', t => {
  const { synth } = setup(t, ''); const coordinator = new SpeechCoordinator(); let finished = 0;
  coordinator.configure(() => ({ voiceURI: 'local', volume: .5 }));
  const first = new SpeechSynthesisUtterance('Briefing'), second = new SpeechSynthesisUtterance('Next sentence');
  first.onerror = () => finished++;
  assert.equal(coordinator.submit('briefing', first), true);
  assert.equal(first.voice.voiceURI, 'local'); assert.equal(first.volume, .5);
  assert.equal(coordinator.submit('assist:hover', new SpeechSynthesisUtterance('Hover')), false);
  assert.equal(coordinator.submit('briefing', second, { queue: true }), true);
  coordinator.stop('assist:hover'); assert.equal(synth.speaking, true);
  coordinator.stop('briefing'); assert.equal(finished, 1); assert.equal(coordinator.owner, '');
});

test('remote or unloaded voices never receive financial text, and unavailable speech leaves a readable status', t => {
  const { doc, controller, spoken, synth, statuses } = setup(t, '<button>Buy Apple</button>');
  synth.getVoices = () => [{ name: 'Online', voiceURI: 'online', localService: false }];
  doc.querySelector('button').focus(); controller.readFocused();
  assert.equal(spoken.length, 0); assert.match(statuses.at(-1), /local voice/i);
  synth.getVoices = () => [];
  assert.equal(speechCoordinator.submit('chart:test', new SpeechSynthesisUtterance('Portfolio $100')), false);
});

test('malformed and composition keyboard events leave typing alone; focus takes priority over stale hover', t => {
  const { doc, spoken } = setup(t, '<button>Buy Apple</button><button>Sell Apple</button>', { enabled: true, hover: true, focus: true });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.doesNotThrow(() => doc.dispatchEvent(new browser.Event('keydown', { bubbles: true })));
  const [buy, sell] = doc.querySelectorAll('button'); hover(buy); t.mock.timers.tick(550);
  key(doc, 'Tab'); sell.focus(); t.mock.timers.tick(180);
  assert.match(spoken.at(-1).text, /Sell Apple/);
  const count = spoken.length; key(doc, 'r', { altKey: true, shiftKey: true, isComposing: true });
  assert.equal(spoken.length, count);
});

test('custom validation and hidden native fields never steal registration focus', async t => {
 const { doc } = setup(t, '<form novalidate><label>Hidden<input required aria-hidden="true"></label><button>Continue</button></form><form><input required aria-hidden="true"><label>Email<input required type="email"></label></form>');
 const [custom, standard] = doc.querySelectorAll('form'); const button = custom.querySelector('button'); button.focus();
 custom.querySelector('input').dispatchEvent(new browser.Event('invalid', { cancelable: true }));
 custom.dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve();
 assert.equal(doc.activeElement, button);
 standard.dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve();
 assert.equal(doc.activeElement, standard.querySelector('input[type="email"]'));
});

test('voice arrows read text and controls in both directions without requiring focus speech or activating actions', t => {
  const { doc, spoken, controller } = setup(t, '<main><h1>Portfolio</h1><p>Your investments</p><button>Buy Apple</button><output>Available cash: $200</output></main>', { enabled: true });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const heading = doc.querySelector('h1'), paragraph = doc.querySelector('p'), buy = doc.querySelector('button');
  let clicks = 0; buy.onclick = () => clicks++;
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, heading); assert.equal(spoken.at(-1).text, 'Portfolio.');
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, paragraph); assert.equal(spoken.at(-1).text, 'Your investments.');
  assert.equal(heading.hasAttribute('tabindex'), false, 'temporary focusability is restored');
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, buy); assert.equal(spoken.at(-1).text, 'Buy Apple.');
  key(doc, 'ArrowDown'); assert.match(spoken.at(-1).text, /Available cash/);
  key(doc, 'ArrowUp'); assert.equal(doc.activeElement, buy);
  key(doc, 'ArrowUp'); assert.equal(doc.activeElement, paragraph);
  t.mock.timers.tick(200); assert.equal(spoken.length, 6, 'no duplicate focus speech');
  assert.equal(clicks, 0);
  controller.destroy(); assert.equal(paragraph.hasAttribute('tabindex'), false);
});

test('voice arrows stay on the first and last items and use the current DOM after redraws', t => {
  const { doc, spoken } = setup(t, '<h1>Portfolio</h1><p>Old value</p>', { enabled: true, focus: true });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  key(doc, 'ArrowDown'); key(doc, 'ArrowUp'); assert.equal(doc.activeElement.tagName, 'H1');
  doc.querySelector('p').outerHTML = '<p>Updated value</p><button>Orders</button>';
  place(doc.querySelector('p'), 0, 60); place(doc.querySelector('button'), 0, 90);
  key(doc, 'ArrowDown'); assert.equal(spoken.at(-1).text, 'Updated value.');
  key(doc, 'ArrowDown'); key(doc, 'ArrowDown'); assert.equal(doc.activeElement.textContent, 'Orders');
  t.mock.timers.tick(180); assert.equal(spoken.length, 5);
});

test('voice arrows skip hidden, inert, disabled and nested duplicate content, including closed details', t => {
  const { doc, spoken } = setup(t, '<h1>Portfolio</h1><div style="display:none"><button>Hidden</button></div><div style="visibility:hidden"><p>Invisible</p></div><div aria-hidden="true"><p>Decoration</p></div><div inert><button>Behind modal</button></div><button disabled>Disabled</button><details><summary>More</summary><p>Collapsed detail</p></details><div data-a11y-read data-a11y-label="Cash"><p>$200</p></div><div role="img" aria-label="NextTrade logo"></div><button>Orders</button>', { enabled: true });
  for (let i = 0; i < 5; i++) key(doc, 'ArrowDown');
  assert.deepEqual(spoken.map(item => item.text), ['Portfolio.', 'More.', 'Cash. $200.', 'NextTrade logo.', 'Orders.']);
});

test('voice arrows remain inside an open modal and restore ordinary navigation after it closes', t => {
  const { doc, spoken } = setup(t, '<button>Background</button><dialog open><h2>Review order</h2><button>Confirm</button><button>Cancel</button></dialog>', { enabled: true });
  key(doc, 'ArrowDown'); assert.equal(spoken.at(-1).text, 'Review order.');
  key(doc, 'ArrowDown'); key(doc, 'ArrowDown'); key(doc, 'ArrowDown');
  assert.equal(doc.activeElement.textContent, 'Cancel');
  key(doc, 'ArrowUp'); assert.equal(doc.activeElement.textContent, 'Confirm');
  doc.querySelector('dialog').close(); doc.querySelector('button').focus();
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement.textContent, 'Background');
});

test('voice arrows leave editing, chart exploration, modifiers and switch scanning alone', t => {
  const { doc, spoken, update } = setup(t, '<h1>Portfolio</h1><input type="number" aria-label="Quantity" value="2"><textarea aria-label="Notes"></textarea><select aria-label="Account"><option>Trading</option></select><div contenteditable="true"><span>Editable text</span></div><div role="img" tabindex="0" aria-label="Price chart"></div><div role="slider" tabindex="0" aria-label="Volume"></div><button>Buy</button>', { enabled: true });
  for (const item of doc.querySelectorAll('input, textarea, select, [contenteditable], [role="img"], [role="slider"]')) {
    item.focus();
    for (const arrow of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      assert.equal(key(doc, arrow), true, 'native arrow behavior is not prevented');
      assert.equal(doc.activeElement, item);
    }
  }
  const buy = doc.querySelector('button'); buy.focus();
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing']) {
    assert.equal(key(doc, 'ArrowUp', { [modifier]: true }), true);
    assert.equal(doc.activeElement, buy);
  }
  update({ enabled: false, arrowNavigation: false }); assert.equal(key(doc, 'ArrowUp'), true); assert.equal(doc.activeElement, buy);
  assert.equal(spoken.length, 0);
});

test('switch scanning owns the arrows while voice mode is enabled', t => {
  const { doc, spoken } = setup(t, '<h1>Portfolio</h1><button>Buy</button>', { enabled: true }, true);
  assert.equal(key(doc, 'ArrowDown'), true); assert.equal(doc.activeElement, doc.body); assert.equal(spoken.length, 0);
});

test('guided arrow navigation leaves a settings field, speaks the instructions and starts at the page heading', t => {
  const { doc, controller, spoken, statuses } = setup(t, '<main><h1>Settings</h1><p>Choose your preferences</p><select aria-label="Speed"><option>Normal</option></select></main>', { enabled: true });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  doc.querySelector('select').focus(); controller.beginArrowNavigation();
  assert.equal(doc.activeElement, doc.querySelector('h1'));
  assert.match(spoken.at(-1).text, /^Arrow-key navigation started.*Press Down or Up arrow.*Settings\.$/);
  assert.match(statuses.at(-1), /Press Down or Up arrow/);
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, doc.querySelector('p'));
  assert.equal(spoken.at(-1).text, 'Choose your preferences.');
  t.mock.timers.tick(180); assert.equal(spoken.length, 2);
});

test('spatial arrows follow rendered rows and columns even when DOM order differs, and never wrap', t => {
  const { doc, spoken } = setup(t, '<button id="br">Bottom right</button><button id="tl">Top left</button><button id="bl">Bottom left</button><button id="tr">Top right</button>', { enabled: true });
  const at = id => doc.getElementById(id);
  place(at('tl'), 0, 0); place(at('tr'), 150, 0, 100, 35);
  place(at('bl'), 0, 100); place(at('br'), 150, 100);
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, at('tl'));
  key(doc, 'ArrowRight'); assert.equal(doc.activeElement, at('tr'));
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, at('br'));
  key(doc, 'ArrowLeft'); assert.equal(doc.activeElement, at('bl'));
  key(doc, 'ArrowUp'); assert.equal(doc.activeElement, at('tl'));
  assert.equal(key(doc, 'ArrowUp'), false, 'an edge prevents the page scrolling');
  assert.equal(doc.activeElement, at('tl')); assert.equal(spoken.at(-1).text, 'No item above.');
  // Right stays horizontal even when the neighboring item's height changes.
  key(doc, 'ArrowRight'); assert.equal(doc.activeElement, at('tr'));
  place(at('br'), 150, -100); place(at('bl'), 0, 200);
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, at('bl'), 'the layout is read again after reflow');
});

test('Enter goes inside named groups, arrows stay at that level, and Escape returns one level at a time', t => {
  const { doc, spoken, controller } = setup(t, '<section data-scan-group="Portfolio"><h2>Value</h2><fieldset><legend>Actions</legend><button>Buy</button><button>Sell</button></fieldset></section><section aria-label="Activity"><button>History</button></section>', { enabled: true });
  const [portfolio, activity] = doc.querySelectorAll('section'), nested = doc.querySelector('fieldset');
  const [buy, sell] = nested.querySelectorAll('button'); let activated = 0; buy.onclick = () => activated++;
  place(portfolio, 0, 0, 200, 200); place(activity, 250, 0, 200, 200);
  place(doc.querySelector('h2'), 10, 10); place(nested, 10, 50, 180, 130);
  place(buy, 20, 80, 60, 20); place(sell, 100, 80, 60, 20);
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, portfolio);
  assert.match(spoken.at(-1).text, /Portfolio\. Group\. Press Enter/);
  key(doc, 'ArrowRight'); assert.equal(doc.activeElement, activity);
  key(doc, 'ArrowLeft'); key(doc, 'Enter'); assert.equal(doc.activeElement.tagName, 'H2');
  assert.match(spoken.at(-1).text, /^Inside Portfolio/);
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement, nested);
  key(doc, 'Enter'); assert.equal(doc.activeElement, buy); assert.equal(activated, 0);
  key(doc, 'Enter', { repeat: true }); assert.equal(activated, 0);
  key(doc, 'ArrowRight'); assert.equal(doc.activeElement, sell);
  key(doc, 'ArrowRight'); assert.equal(doc.activeElement, sell);
  assert.match(spoken.at(-1).text, /No item to the right.*Escape/);
  key(doc, 'Escape'); assert.equal(doc.activeElement, nested);
  key(doc, 'Escape'); assert.equal(doc.activeElement, portfolio);
  key(doc, 'ArrowRight'); assert.equal(doc.activeElement, activity);
  controller.destroy(); assert.equal(activity.hasAttribute('data-a11y-nav-focus'), false);
  assert.equal(activity.hasAttribute('tabindex'), false);
});

test('Escape leaves an editing field for its group, but lets an expanded picker close first', t => {
  const { doc } = setup(t, '<fieldset><legend>Order</legend><input aria-label="Quantity" value="2"><button role="combobox" aria-expanded="true">Stock</button></fieldset>', { enabled: true });
  const group = doc.querySelector('fieldset'), picker = doc.querySelector('button'), input = doc.querySelector('input');
  input.focus(); key(doc, 'Escape'); assert.equal(doc.activeElement, group);
  picker.focus(); let closed = 0;
  picker.onkeydown = event => { if (event.key === 'Escape') { closed++; picker.setAttribute('aria-expanded', 'false'); } };
  key(doc, 'Escape'); assert.equal(closed, 1); assert.equal(doc.activeElement, picker);
  key(doc, 'Escape'); assert.equal(closed, 1); assert.equal(doc.activeElement, group);
});

test('arrow navigation and voice save independently, including migration of older preferences', () => {
  assert.equal(parseAssistivePreferences({}, {}).arrowNavigation, false);
  assert.equal(parseAssistivePreferences({ enabled: true }, {}).arrowNavigation, true, 'older saved voice mode keeps working');
  assert.equal(parseAssistivePreferences({ enabled: true }, { arrowNavigation: false }).arrowNavigation, false);
  for (const value of ['true', 1, null]) assert.equal(parseAssistivePreferences({}, { arrowNavigation: value }).arrowNavigation, false);
  const navigation = mergeAssistivePreferences({}, {}, { arrowNavigation: true });
  assert.equal(navigation.voice.enabled, false); assert.equal(navigation.visual.arrowNavigation, true);
  const voiced = mergeAssistivePreferences(navigation.voice, navigation.visual, { enabled: true });
  const quiet = mergeAssistivePreferences(voiced.voice, voiced.visual, { enabled: false });
  assert.equal(parseAssistivePreferences(quiet.voice, quiet.visual).arrowNavigation, true);
  const voiceOnly = mergeAssistivePreferences({}, {}, { enabled: true });
  assert.equal(voiceOnly.voice.enabled, true); assert.equal(voiceOnly.visual.arrowNavigation, false);
});

test('silent navigation moves, enters and exits groups and reports boundaries without any speech API', t => {
  const { doc, spoken, statuses, controller } = setup(t, '<main><h1>Settings</h1><section aria-label="Preferences"><button>First</button><button>Second</button></section></main>', { enabled: false, arrowNavigation: true, focus: true, hover: true });
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: undefined });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
  controller.beginArrowNavigation(); assert.equal(doc.activeElement.tagName, 'H1');
  assert.match(statuses.at(-1), /Arrow-key navigation started/);
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement.tagName, 'SECTION');
  key(doc, 'Enter'); assert.equal(doc.activeElement.textContent, 'First');
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement.textContent, 'Second');
  assert.equal(doc.activeElement.hasAttribute('data-a11y-nav-focus'), true);
  key(doc, 'ArrowDown'); assert.match(statuses.at(-1), /No item below/);
  key(doc, 'Escape'); assert.equal(doc.activeElement.tagName, 'SECTION');
  assert.equal(spoken.length, 0);
});

test('turning voice off retains navigation and its highlight, and navigation can be disabled separately', t => {
  const { doc, spoken, update } = setup(t, '<button>First</button><button>Second</button>', { enabled: true, arrowNavigation: true });
  key(doc, 'ArrowDown'); assert.equal(spoken.length, 1);
  update({ enabled: false }); assert.equal(doc.activeElement.hasAttribute('data-a11y-nav-focus'), true);
  key(doc, 'ArrowDown'); assert.equal(doc.activeElement.textContent, 'Second'); assert.equal(spoken.length, 1);
  update({ arrowNavigation: false }); assert.equal(doc.activeElement.hasAttribute('data-a11y-nav-focus'), false);
  assert.equal(key(doc, 'ArrowUp'), true); assert.equal(doc.activeElement.textContent, 'Second');
});
