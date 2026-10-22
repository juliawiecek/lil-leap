import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser } from './dom-helper.mjs';
const { SpeechService, CaptionStrip, CAPTION_HOLD_MS, parseCaptionSettings, speechService, speechTime } = await import('../src/app/speech.ts');
const { ACCESSIBILITY_STORAGE_KEY } = await import('../src/app/accessibility.ts');

const doc = browser.document;

/** A speech engine stand-in: records what was said; nothing finishes until the test says so. */
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
    doc.body.innerHTML = '';
    doc.documentElement.classList.remove('has-captions');
    doc.documentElement.style.removeProperty('--caption-offset');
  });
  return { said: () => spoken.map((u) => u.text), spoken, synth };
}

function withStorage(t, initial = null) {
  const values = new Map(initial ? [[ACCESSIBILITY_STORAGE_KEY, initial]] : []);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  });
  return values;
}

const strip = () => doc.querySelector('.caption-strip');

test('captions are on unless they were turned off', () => {
  assert.deepEqual(parseCaptionSettings(undefined), { show: true });
  assert.deepEqual(parseCaptionSettings('junk'), { show: true });
  assert.deepEqual(parseCaptionSettings({ show: false }), { show: false });
  assert.ok(speechService() instanceof SpeechService, 'outside Angular a service of its own');
  assert.equal(speechTime('x'.repeat(5000)), 30000);
});

test('polite speech never cuts anyone else off; the same speaker replaces its own sentence', (t) => {
  const { said, synth } = withSpeech(t);
  const speech = new SpeechService();
  assert.equal(speech.speak('Menu group', { source: 'switch' }), true);
  assert.equal(speech.speak('Trade group', { source: 'switch' }), true);
  assert.equal(synth.cancelled, 1, 'the ring moving on cuts off its own last item');
  assert.equal(speech.speak('Chart summary.', { source: 'switch', queue: true }), true);
  assert.equal(synth.cancelled, 1, 'queued after the ring, not cutting it off');
  assert.equal(speech.speak('Hello.', { source: 'chart' }), false, 'another speaker is talking, so it stays quiet');
  assert.deepEqual(said(), ['Menu group', 'Trade group', 'Chart summary.']);
  assert.equal(speech.speak('   '), false, 'nothing to say');
});

test('urgent speech cuts in, and polite speech waits behind it or stays quiet', (t) => {
  const { said, synth, spoken } = withSpeech(t);
  const speech = new SpeechService();
  speech.speak('Good morning.', { source: 'briefing', priority: 'urgent' });
  speech.speak('Your portfolio is worth $25,000.', { source: 'briefing', priority: 'urgent', queue: true });
  assert.equal(synth.cancelled, 1);
  assert.equal(speech.speak('Buy, selected', { source: 'switch' }), false, 'the ring never talks over the briefing');
  speech.speak("You're about to buy 2 shares of Apple for $450.", { source: 'switch', priority: 'urgent' });
  assert.equal(synth.cancelled, 2, 'the read-back cuts the briefing off');
  assert.equal(speech.speak('Edit', { source: 'switch' }), false, 'not even the same speaker cuts the read-back off');
  assert.equal(speech.speak('Confirm buy', { source: 'switch', queue: true }), true, 'but may wait for it');
  assert.equal(speech.busy('switch'), true);
  assert.equal(speech.busy('glossary'), true, 'everyone waits for urgent speech');
  spoken.at(-1).onend();
  assert.equal(speech.busy(), false, 'the last sentence finished, so everything before it did too');
  assert.equal(speech.speaking(), false);
  spoken[0].onerror();
  assert.equal(speech.speaking(), false, 'a late error from a cut-off sentence changes nothing');
  assert.deepEqual(said().slice(-2), ["You're about to buy 2 shares of Apple for $450.", 'Confirm buy']);
});

test('a voice from outside the app is never interrupted by polite speech', (t) => {
  const { said } = withSpeech(t, true);
  const speech = new SpeechService();
  assert.equal(speech.speak('Menu group'), false);
  assert.equal(speech.speak('Read-back', { priority: 'urgent' }), true);
  assert.deepEqual(said(), ['Read-back']);
});

test('each sentence is captioned while spoken and for 4 seconds after, in an aria-hidden strip', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => t.mock.timers.reset());
  withStorage(t);
  const { spoken } = withSpeech(t);
  const speech = new SpeechService();
  let started = 0, ended = 0;
  speech.speak('One.', { source: 'briefing', priority: 'urgent', onStart: () => started++ });
  speech.speak('Two.', { source: 'briefing', priority: 'urgent', queue: true, onEnd: () => ended++ });
  assert.equal(speech.caption(), 'One.', 'shown straight away');
  assert.equal(strip().textContent, 'One.');
  assert.equal(strip().getAttribute('aria-hidden'), 'true');
  assert.ok(strip().hasAttribute('data-scan-ignore'), 'switch control never rings it');
  assert.ok(doc.documentElement.classList.contains('has-captions'), 'bars, toasts and dialogs move up above it');
  assert.match(doc.documentElement.style.getPropertyValue('--caption-offset'), /^\d+px$/);
  spoken[0].onstart();
  spoken[0].onend();
  spoken[1].onstart();
  assert.equal(started, 1);
  assert.equal(speech.caption(), 'Two.', 'the caption follows the sentence being read');
  spoken[1].onend();
  assert.equal(ended, 1);
  t.mock.timers.tick(CAPTION_HOLD_MS - 1);
  assert.equal(speech.caption(), 'Two.', 'still showing just after it was said');
  t.mock.timers.tick(1);
  assert.equal(speech.caption(), '');
  assert.equal(strip().hidden, true);
  assert.equal(doc.documentElement.classList.contains('has-captions'), false);
});

test('a caption never sticks when the speech engine stalls, and cancelling clears it soon after', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => t.mock.timers.reset());
  withStorage(t);
  const { synth } = withSpeech(t);
  const speech = new SpeechService();
  speech.speak('Buy');
  t.mock.timers.tick(speechTime('Buy') + CAPTION_HOLD_MS);
  assert.equal(speech.caption(), '');
  assert.equal(speech.busy(), false);
  assert.equal(speech.speak('Sell'), true, 'a stalled sentence is forgotten, so speech carries on');
  speech.cancel('briefing');
  assert.equal(synth.cancelled, 0, 'the briefing was not talking, so nothing is cut off');
  speech.cancel();
  assert.equal(synth.cancelled, 1);
  assert.equal(speech.speaking(), false);
  t.mock.timers.tick(CAPTION_HOLD_MS);
  assert.equal(speech.caption(), '');
});

test('the strip moves into an open dialog, above its backdrop, and back out when it closes', (t) => {
  withSpeech(t);
  doc.body.innerHTML = '<dialog id="review"><button>Confirm buy</button></dialog>';
  const dialog = doc.getElementById('review');
  dialog.open = true;
  const captions = new CaptionStrip(doc);
  captions.show("You're about to buy 2 shares of Apple.");
  assert.equal(captions.element.parentElement, dialog);
  dialog.open = false;
  captions.show('Buy selected.');
  assert.equal(captions.element.parentElement, doc.body);
  captions.hide();
  assert.equal(captions.element.textContent, '');
});

test('turning captions off hides the strip but keeps the caption for voice mode; the choice is saved', (t) => {
  const saved = withStorage(t);
  withSpeech(t);
  const speech = new SpeechService();
  speech.speak('Menu group');
  assert.equal(strip().hidden, false);
  speech.setCaptions(false);
  assert.equal(strip().hidden, true);
  assert.deepEqual(JSON.parse(saved.get(ACCESSIBILITY_STORAGE_KEY)).captions, { show: false });
  speech.speak('Trade group');
  assert.equal(speech.caption(), 'Trade group');
  assert.equal(strip().hidden, true, 'still hidden while off');
  speech.setCaptions(true);
  assert.equal(strip().textContent, 'Trade group', 'shows what is being said as soon as it is turned back on');
  assert.equal(new SpeechService().settings().show, true);
});

test('a browser that cannot speak still shows the caption', (t) => {
  withStorage(t);
  const before = globalThis.speechSynthesis;
  globalThis.speechSynthesis = undefined;
  t.after(() => { globalThis.speechSynthesis = before; doc.body.innerHTML = ''; });
  const speech = new SpeechService();
  assert.equal(speech.supported, false);
  assert.equal(speech.speak('Buying power. The cash in your account.', { priority: 'urgent' }), false);
  assert.equal(speech.caption(), 'Buying power. The cash in your account.');
  speech.cancel();
  assert.equal(speech.speaking(), false);
});
