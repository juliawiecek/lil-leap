import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser } from './dom-helper.mjs';
const { AssistiveController } = await import('../../shared/assistive-controller.ts');
const { parseAssistivePreferences, mergeAssistivePreferences, applyAssistiveVisuals } = await import('../../shared/assistive-preferences.ts');
const { describeElement } = await import('../../shared/accessible-description.ts');
const { SpeechCoordinator, speechCoordinator } = await import('../../shared/speech-coordinator.ts');

function setup(t, markup, patch = {}, scanning = false) {
  browser.document.body.innerHTML = markup;
  let preferences = { ...parseAssistivePreferences({}, {}), ...patch };
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
  assert.match(describeElement(quantity), /Quantity.*Required number field.*Value 2.*Invalid entry.*whole number/);
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
  assert.equal(spoken.length, 1); assert.match(spoken[0].text, /Buy Apple.*button/); assert.equal(clicks, 0);
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
  const { doc, controller, spoken } = setup(t, '<main><h1>Sign in</h1><form novalidate><label>Email<input type="email" required></label><button>Continue</button></form></main>');
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
