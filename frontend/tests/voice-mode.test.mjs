import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestBed } from '@angular/core/testing';
import { render, browser } from './dom-helper.mjs';
import { FakeAudioContext } from './fake-audio.mjs';
const { AssistiveSettings } = await import('../src/app/assistive-tools.ts');
const { SiteAccessibility, VOICE_ON } = await import('../src/app/site-accessibility.ts');
const { BriefingService } = await import('../src/app/briefing-button.ts');
const { ToastService } = await import('../src/app/toasts.ts');
const { ACCESSIBILITY_STORAGE_KEY, AccessibilityStore } = await import('../src/app/accessibility.ts');
const { SoundCues } = await import('../src/app/sound-cues.ts');
const { AssistiveController } = await import('../../shared/assistive-controller.ts');
const { parseAssistivePreferences } = await import('../../shared/assistive-preferences.ts');
const { describeElement } = await import('../../shared/accessible-description.ts');
const { speechCoordinator } = await import('../../shared/speech-coordinator.ts');

/**
 * Voice mode (PS-22): the one On/Off setting, its speed shared with the briefing, Brief and
 * Detailed levels, and which speech wins when several things want to talk.
 */

/** A browser speech engine with one local voice that records what it is asked to say. */
function fakeSpeech(t) {
  const spoken = [];
  const synth = {
    speaking: false, paused: false, cancelCount: 0,
    speak(utterance) { spoken.push(utterance); this.speaking = true; },
    cancel() { this.cancelCount++; this.speaking = false; },
    pause() { this.paused = true; }, resume() { this.paused = false; },
    getVoices: () => [{ name: 'Local', voiceURI: 'local', localService: true, default: true }],
  };
  const previous = ['speechSynthesis', 'SpeechSynthesisUtterance'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: synth });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(text) { this.text = text; } } });
  t.after(() => {
    speechCoordinator.stop();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  });
  return { spoken, synth };
}

/** Browser storage that can be read back after a "reload". */
function withStorage(t, saved = {}) {
  const values = new Map(Object.keys(saved).length ? [[ACCESSIBILITY_STORAGE_KEY, JSON.stringify(saved)]] : []);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  return values;
}

/** A controller on its own page, as the site-accessibility tests use it. */
function controllerFor(t, markup, patch = {}, extra = {}) {
  browser.document.body.innerHTML = markup;
  let preferences = { ...parseAssistivePreferences({}, {}), ...patch };
  const controller = new AssistiveController(browser.document, {
    settings: () => preferences, status() {}, state() {}, voices() {}, ...extra,
  });
  controller.start();
  t.after(() => { controller.destroy(); browser.document.body.innerHTML = ''; });
  return { controller, doc: browser.document, update: (next) => { preferences = { ...preferences, ...next }; controller.apply(); } };
}
const press = (doc, key, options = {}) => (doc.activeElement ?? doc.body).dispatchEvent(new browser.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));

test('voice mode is off by default, and its settings say it is for people who do not use a screen reader', () => {
  const defaults = parseAssistivePreferences(undefined, undefined);
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.level, 'brief', 'Brief is the default level');
  assert.equal(defaults.soundCues, false);
  // Only a saved `true` turns it on: a tampered or truthy value never does.
  for (const enabled of ['true', 1, 'yes', null]) assert.equal(parseAssistivePreferences({ enabled }).enabled, false);
});

test('the toggle is one aria-pressed button: on says "Voice mode on", off stops speech at once, and it survives a reload', async (t) => {
  const storage = withStorage(t);
  const { spoken, synth } = fakeSpeech(t);
  const fixture = await render(t, AssistiveSettings);
  const root = fixture.nativeElement;
  const toggles = [...root.querySelectorAll('[aria-pressed]')].filter((el) => el.textContent.includes('Voice mode'));
  assert.equal(toggles.length, 1, 'there is one voice mode setting');
  const [toggle] = toggles;
  assert.equal(toggle.tagName, 'BUTTON');
  assert.equal(toggle.getAttribute('type'), 'button', 'a real button: mouse, keyboard and switch control all press it');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.match(root.textContent, /For people who don't use a screen reader/);

  toggle.click(); fixture.detectChanges();
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(VOICE_ON, 'Voice mode on.');
  assert.deepEqual(spoken.map((u) => u.text), ['Voice mode on.']);
  assert.equal(JSON.parse(storage.get(ACCESSIBILITY_STORAGE_KEY)).voice.enabled, true);
  assert.equal(new AccessibilityStore().read('voice', (v) => parseAssistivePreferences(v).enabled), true, 'still on after a reload');

  // Something is being read when it is turned off: it stops at once.
  const access = TestBed.inject(SiteAccessibility);
  access.announce('Order filled: 2 AAPL at $185.00.');
  assert.equal(synth.speaking, true);
  toggle.click(); fixture.detectChanges();
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(synth.speaking, false);
  assert.equal(new AccessibilityStore().read('voice', (v) => parseAssistivePreferences(v).enabled), false);
  // Turning on again when it is already on says nothing new.
  access.update({ enabled: true }); access.update({ enabled: true });
  assert.equal(spoken.filter((u) => u.text === 'Voice mode on.').length, 2);
});

test('voice speed is one setting with the briefing, changed from either side', async (t) => {
  withStorage(t);
  fakeSpeech(t);
  const fixture = await render(t, AssistiveSettings);
  const access = TestBed.inject(SiteAccessibility);
  const briefing = TestBed.inject(BriefingService);
  access.update({ rate: 1.5 });
  assert.equal(briefing.settings().rate, 1.5, 'voice mode to briefing');
  briefing.update({ rate: 0.8 });
  assert.equal(access.settings().rate, 0.8, 'briefing to voice mode');
  fixture.detectChanges();
  const speed = fixture.nativeElement.querySelector('select[id$="-rate"]');
  assert.equal(speed.value, '0.8', 'the voice mode card shows the briefing speed');
});

test('a fill or rejection cuts in on polite speech while voice mode is on, and is silent while it is off', async (t) => {
  withStorage(t, { voice: { enabled: true, focus: true } });
  const { spoken } = fakeSpeech(t);
  await render(t, AssistiveSettings);
  const toasts = TestBed.inject(ToastService);
  speechCoordinator.submit('assist:focus', new SpeechSynthesisUtterance('Buy, Apple.'));
  toasts.show('filled', 'Order filled: 2 AAPL at $185.00', 'Your shares are in Holdings.');
  TestBed.tick();
  assert.equal(spoken.at(-1).text, 'Order filled: 2 Apple at 185 dollars. Your shares are in Holdings.');
  assert.equal(speechCoordinator.owner, 'assist:alert');
  toasts.show('info', 'Watchlist updated');
  TestBed.tick();
  assert.equal(spoken.length, 2, 'information toasts are not read out');

  TestBed.inject(SiteAccessibility).update({ enabled: false });
  toasts.show('rejected', 'Order rejected', 'Not enough buying power.');
  TestBed.tick();
  assert.equal(spoken.length, 2, 'with voice mode off (a screen reader user), nothing extra is spoken');
});

test('fields say their label and value, empty fields say "empty", and private values are never read', () => {
  const doc = browser.document;
  doc.body.innerHTML = `
    <label for="shares">Number of shares</label><input id="shares" type="number" value="2">
    <label for="limit">Limit price</label><input id="limit" type="text" value="">
    <label for="pw">Password</label><input id="pw" type="password" value="hunter2">
    <div data-a11y-sensitive><label for="acct">Account</label><input id="acct" value="12345678"></div>`;
  assert.equal(describeElement(doc.getElementById('shares'), false, 'brief'), 'Number of shares, 2.');
  assert.equal(describeElement(doc.getElementById('limit'), false, 'brief'), 'Limit price, empty.');
  assert.doesNotMatch(describeElement(doc.getElementById('pw'), false, 'detailed'), /hunter2/);
  assert.doesNotMatch(describeElement(doc.getElementById('acct'), false, 'detailed'), /12345678/);
  doc.body.innerHTML = '';
});

test('Brief says name and value; Detailed adds role, state and the glossary hint', (t) => {
  const markup = `
    <button aria-expanded="true">Order book</button>
    <button aria-pressed="true">1 week</button>
    <label><input type="checkbox" checked>Good till cancelled</label>
    <button data-glossary="buying-power">Buying power</button>`;
  const hint = (element) => element.closest('[data-glossary]') ? 'Buying power is the cash you can use to buy shares now.' : '';
  const { doc } = controllerFor(t, markup, {}, { hint });
  const [book, week, power] = doc.querySelectorAll('button');
  const checkbox = doc.querySelector('input');
  assert.equal(describeElement(book, false, 'brief'), 'Order book.');
  assert.equal(describeElement(book, false, 'detailed'), 'Order book. button. Expanded.');
  assert.equal(describeElement(week, false, 'detailed'), '1 week. button. Selected.');
  assert.equal(describeElement(checkbox, false, 'brief'), 'Good till cancelled.');
  assert.equal(describeElement(checkbox, false, 'detailed'), 'Good till cancelled. checkbox. checked.');
  assert.equal(describeElement(power, false, 'brief', ''), 'Buying power.');
  assert.equal(describeElement(power, false, 'detailed', hint(power)), 'Buying power. button. Buying power is the cash you can use to buy shares now.');
});

test('switching level takes effect on the next spoken item, with the glossary hint only in Detailed', (t) => {
  const { spoken } = fakeSpeech(t);
  const hint = (element) => element.closest('[data-glossary]') ? 'The cash you can use now.' : '';
  const { doc, update } = controllerFor(t, '<button data-glossary="buying-power">Buying power</button><button aria-expanded="false">Order book</button>', { enabled: true, focus: true }, { hint });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const [power, book] = doc.querySelectorAll('button');
  press(doc, 'Tab'); power.focus(); t.mock.timers.tick(180);
  assert.equal(spoken.at(-1).text, 'Buying power.');
  update({ level: 'detailed' });
  book.focus(); t.mock.timers.tick(180);
  assert.equal(spoken.at(-1).text, 'Order book. button. Collapsed.');
  t.mock.timers.tick(1000);
  power.focus(); t.mock.timers.tick(180);
  assert.equal(spoken.at(-1).text, 'Buying power. button. The cash you can use now.');
});

test('moving quickly speaks only the last control, and the same phrase is not said twice within half a second', (t) => {
  const { spoken } = fakeSpeech(t);
  const { doc, controller } = controllerFor(t, '<button>Portfolio</button><button>Markets</button><button>Activity</button>', { enabled: true, focus: true, hover: true });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const buttons = doc.querySelectorAll('button');
  press(doc, 'Tab');
  for (const button of buttons) { button.focus(); t.mock.timers.tick(60); }
  t.mock.timers.tick(180);
  assert.deepEqual(spoken.map((u) => u.text), ['Activity.']);
  // Hover landing on the item focus just read does not say it again straight away.
  buttons[2].dispatchEvent(new browser.PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
  t.mock.timers.tick(200);
  assert.equal(controller.announce('Activity.'), false, 'repeat within 0.5 s');
  assert.equal(spoken.length, 1);
  buttons[2].dispatchEvent(new browser.PointerEvent('pointerout', { bubbles: true, relatedTarget: doc.body }));
  t.mock.timers.tick(400);
  assert.equal(controller.announce('Activity.'), true, 'after half a second it can be said again');
});

test('polite speech never interrupts a playing briefing; urgent speech does; Escape stops speech', (t) => {
  const { spoken, synth } = fakeSpeech(t);
  const { doc, controller } = controllerFor(t, '<button>Buy</button>', { enabled: true, focus: true });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const briefing = speechCoordinator.channel('briefing');
  briefing.speak(new SpeechSynthesisUtterance('Good morning. The market is open.'));
  press(doc, 'Tab'); doc.querySelector('button').focus(); t.mock.timers.tick(180);
  assert.deepEqual(spoken.map((u) => u.text), ['Good morning. The market is open.'], 'focus waits for the briefing');
  assert.equal(speechCoordinator.owner, 'briefing');

  assert.equal(controller.announce('Order rejected. Not enough buying power.', true), true);
  assert.equal(speechCoordinator.owner, 'assist:alert');
  assert.ok(synth.cancelCount > 0, 'the urgent message cut in');

  press(doc, 'Escape');
  assert.equal(synth.speaking, false);
  assert.equal(speechCoordinator.speaking, false);
});

test('with voice mode off, announcements and Escape leave a screen reader alone', (t) => {
  const { spoken, synth } = fakeSpeech(t);
  const { doc, controller } = controllerFor(t, '<button>Buy</button>');
  assert.equal(controller.announce('Order filled.', true), false);
  // A screen reader user's own speech is not ours to stop: Escape does nothing to it.
  synth.speaking = true; const cancels = synth.cancelCount;
  press(doc, 'Escape');
  assert.equal(synth.cancelCount, cancels);
  assert.equal(spoken.length, 0);
});

test('sound cues add nothing to the page, so the accessibility tree is unchanged', () => {
  const doc = browser.document;
  doc.body.innerHTML = '<main><button>Buy</button></main>';
  const before = doc.documentElement.outerHTML;
  const context = new FakeAudioContext();
  const cues = new SoundCues({ createContext: () => context });
  cues.unlock();
  for (const cue of ['ring', 'fill', 'reject', 'keypad', 'warning']) assert.equal(cues.play(cue), true);
  assert.ok(context.nodes.length > 0);
  assert.equal(doc.documentElement.outerHTML, before);
  doc.body.innerHTML = '';
});
