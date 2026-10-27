import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { render, browser } from './dom-helper.mjs';
import { contrast, palettes } from './colour-math.mjs';
const { CAPTION_HOLD_MS, CaptionBar, CaptionService, captionTime, parseCaptionSettings, sayNow } = await import('../src/app/captions.ts');
const { CaptionSettingsCard } = await import('../src/app/caption-settings.ts');
const { AccessibilitySettings } = await import('../src/app/accessibility-settings.ts');
const { SpeechCoordinator, speechCoordinator } = await import('../../shared/speech-coordinator.ts');
const { ScanEngine } = await import('../../shared/switch-scan.ts');
const { BriefingService } = await import('../src/app/briefing-button.ts');
const { ACCESSIBILITY_STORAGE_KEY } = await import('../src/app/accessibility.ts');

const doc = browser.document;
const strip = () => doc.querySelector('.caption-strip');

/** A speech engine stand-in: records utterances; nothing finishes until the test says so. */
function withSynth(t) {
  const spoken = [];
  const synth = { speaking: false, paused: false, speak: (u) => spoken.push(u), cancel() {} };
  class Utterance { constructor(text) { this.text = text; } }
  const before = {
    synth: Object.getOwnPropertyDescriptor(globalThis, 'speechSynthesis'),
    utterance: Object.getOwnPropertyDescriptor(globalThis, 'SpeechSynthesisUtterance'),
  };
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, writable: true, value: synth });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: Utterance });
  t.after(() => {
    for (const [name, descriptor] of [['speechSynthesis', before.synth], ['SpeechSynthesisUtterance', before.utterance]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  });
  return { spoken, synth, Utterance };
}

function withStorage(t, initial = {}) {
  const values = new Map(Object.entries(initial));
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) },
  });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  return values;
}

/** A caption bar on a clean page, listening to the given coordinator. */
function captioned(t, speech) {
  doc.body.innerHTML = '';
  const bar = new CaptionBar(doc, speech);
  bar.start();
  t.after(() => { bar.stop(); doc.body.innerHTML = ''; });
  return bar;
}

test('each phrase is captioned while it is spoken and for about 4 seconds after', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { spoken, Utterance } = withSynth(t);
  const speech = new SpeechCoordinator();
  const bar = captioned(t, speech);
  speech.channel('briefing').speak(new Utterance('Good afternoon.'));
  speech.channel('briefing').speak(new Utterance('The market is open.'));
  assert.equal(strip().textContent, 'Good afternoon.');
  assert.equal(bar.text(), 'Good afternoon.');
  assert.equal(strip().hidden, false);
  t.mock.timers.tick(3000);
  assert.equal(strip().textContent, 'Good afternoon.', 'still shown while it is being spoken');
  spoken[0].onend({});
  assert.equal(strip().textContent, 'The market is open.', 'the next sentence replaces it as it starts');
  spoken[1].onend({});
  t.mock.timers.tick(CAPTION_HOLD_MS - 1);
  assert.equal(strip().hidden, false, 'held after the sentence ends');
  t.mock.timers.tick(1);
  assert.equal(strip().hidden, true);
  assert.equal(bar.text(), '');
  assert.equal(doc.documentElement.classList.contains('has-captions'), false);
});

test('the strip is hidden from screen readers and switch control, and moves the docked bars up', (t) => {
  const { Utterance } = withSynth(t);
  const speech = new SpeechCoordinator();
  captioned(t, speech);
  speech.submit('glossary', new Utterance('Buying power.'), { interrupt: true });
  assert.equal(strip().getAttribute('aria-hidden'), 'true');
  assert.ok(strip().hasAttribute('data-scan-ignore'));
  const root = doc.documentElement;
  assert.ok(root.classList.contains('has-captions'));
  assert.match(root.style.getPropertyValue('--caption-offset'), /^\d+px$/);
  speech.stop();
});

test('with a dialog open the strip moves into it, so it shows above the trade review', (t) => {
  const { Utterance } = withSynth(t);
  const speech = new SpeechCoordinator();
  captioned(t, speech);
  doc.body.innerHTML = '<dialog id="review"><button>Confirm buy</button></dialog>';
  doc.getElementById('review').showModal();
  speech.submit('switch', new Utterance("You're about to buy 2 shares of Apple."), { interrupt: true });
  assert.equal(strip().parentElement.id, 'review');
  speech.stop();
});

test('a stalled speech engine never leaves a caption on screen for good', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { Utterance } = withSynth(t);
  const speech = new SpeechCoordinator();
  captioned(t, speech);
  speech.submit('switch', new Utterance('Menu group'), { interrupt: true });
  t.mock.timers.tick(captionTime('Menu group') + CAPTION_HOLD_MS);
  assert.equal(strip().hidden, true);
});

test('turned off, nothing is drawn; turned back on, the sentence being said shows', (t) => {
  const { Utterance } = withSynth(t);
  const speech = new SpeechCoordinator();
  const bar = captioned(t, speech);
  bar.shown = false;
  speech.submit('switch', new Utterance('Trade group'), { interrupt: true });
  assert.equal(strip(), null);
  assert.equal(bar.text(), 'Trade group', 'still followed, so it can show at once');
  bar.shown = true;
  assert.equal(strip().textContent, 'Trade group');
  bar.shown = false;
  assert.equal(strip().hidden, true);
  speech.stop();
});

test('switch control, the briefing and Alt+W are captioned through the shared voice', (t) => {
  withStorage(t);
  const { spoken } = withSynth(t);
  const service = new CaptionService();
  doc.body.innerHTML = '';
  service.start(doc);
  t.after(() => { service.stop(); speechCoordinator.stop(); doc.body.innerHTML = ''; });
  const engine = new ScanEngine(doc, { isVisible: () => true, autoAdvance: false, speak: true });
  doc.body.innerHTML = '<nav data-scan-group="Menu"><button>Home</button><button>Orders</button></nav><button>Buy</button>';
  engine.start();
  t.after(() => engine.stop());
  assert.equal(service.bar.text(), 'Switch control on. Press the space bar to choose.');
  spoken.at(-2).onend({});
  assert.equal(service.bar.text(), 'Menu group', 'the ring move, as it is spoken');
  engine.next();
  assert.equal(service.bar.text(), 'Buy');
  engine.stop();
  new BriefingService().play(['Good afternoon.', 'The market is open.']);
  assert.equal(service.bar.text(), 'Good afternoon.');
  assert.equal(sayNow('glossary', 'Buying power. The cash you can use to buy stocks right now.'), true);
  assert.equal(service.bar.text(), 'Buying power. The cash you can use to buy stocks right now.', 'cuts in on the briefing');
});

test('a sentence the browser cannot say is still shown as a caption', (t) => {
  withStorage(t);
  const before = Object.getOwnPropertyDescriptor(globalThis, 'speechSynthesis');
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, writable: true, value: undefined });
  t.after(() => { if (before) Object.defineProperty(globalThis, 'speechSynthesis', before); else delete globalThis.speechSynthesis; });
  const service = new CaptionService();
  doc.body.innerHTML = '';
  service.start(doc);
  t.after(() => { service.stop(); doc.body.innerHTML = ''; });
  assert.equal(sayNow('glossary', 'No extra help for this item.'), false);
  assert.equal(strip().textContent, 'No extra help for this item.');
});

test('captions are off unless turned on, and the choice is saved with the other accessibility settings', (t) => {
  const values = withStorage(t);
  assert.deepEqual(parseCaptionSettings(undefined), { show: false });
  assert.deepEqual(parseCaptionSettings({ show: true }), { show: true });
  assert.deepEqual(parseCaptionSettings('junk'), { show: false });
  const service = new CaptionService();
  service.start(doc);
  t.after(() => service.stop());
  assert.equal(service.bar.shown, false, 'off for a new user');
  service.setCaptions(true);
  assert.deepEqual(JSON.parse(values.get(ACCESSIBILITY_STORAGE_KEY)).captions, { show: true });
  assert.equal(service.bar.shown, true);
  assert.equal(new CaptionService().settings().show, true, 'kept after a reload');
});

test('the Captions card in Settings turns the strip on and off', async (t) => {
  withStorage(t);
  const fixture = await render(t, CaptionSettingsCard);
  const root = fixture.nativeElement;
  const toggle = root.querySelector('.caption-toggle');
  assert.equal(root.querySelector('#' + toggle.getAttribute('aria-labelledby')).textContent.trim(), 'Captions');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(toggle.textContent.trim(), 'Off');
  toggle.click(); fixture.detectChanges();
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(fixture.componentInstance.captions.settings().show, true);
  toggle.click(); fixture.detectChanges();
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
});

test('the Captions card is part of the Accessibility section both dashboards share', async (t) => {
  withStorage(t);
  const settings = await render(t, AccessibilitySettings);
  assert.ok(settings.nativeElement.querySelector('app-caption-settings [data-scan-group="Captions"]'), 'on both dashboards\' Settings page');
});

test('the strip passes AA contrast in every colour mode, grows with zoom and clears the docked controls', () => {
  const css = readFileSync(new URL('../src/captions.scss', import.meta.url), 'utf8');
  const rule = css.match(/\.caption-strip \{([^}]*)\}/)[1];
  assert.match(rule, /color: var\(--text\);/);
  assert.match(rule, /background: var\(--surface\);/);
  assert.match(rule, /font: 600 1\.125rem/, 'sized in rem, so it follows zoom and text size');
  assert.match(rule, /max-width: min\(760px, calc\(100vw - 32px\)\)/, 'wraps inside the screen at 200% zoom');
  assert.match(rule, /pointer-events: none/, 'never blocks a click');
  const modes = palettes(readFileSync(new URL('../public/theme-tokens.css', import.meta.url), 'utf8'));
  for (const [mode, tokens] of Object.entries(modes)) {
    assert.ok(contrast(tokens.text, tokens.surface) >= 7, `${mode}: caption text ${contrast(tokens.text, tokens.surface).toFixed(1)}:1`);
  }
  assert.match(css, /html\.has-captions dialog:modal \{[^}]*bottom: var\(--caption-offset/);
  assert.match(css, /html\.has-captions :is\(app-novice-dashboard, app-advanced-dashboard\) \{[^}]*padding-bottom: var\(--caption-offset/);
  const scan = readFileSync(new URL('../../shared/switch-scan.scss', import.meta.url), 'utf8');
  assert.match(scan, /\.scan-bar \{[^}]*bottom: calc\(16px \+ var\(--caption-offset, 0px\)\)/);
  assert.match(scan, /\.scan-pad \{[^}]*bottom: calc\(24px \+ var\(--caption-offset, 0px\)\)/);
  const toasts = readFileSync(new URL('../src/app/toasts.ts', import.meta.url), 'utf8');
  assert.match(toasts, /\.toasts \{[^}]*bottom: calc\(16px \+ var\(--caption-offset, 0px\)\)/);
  const angular = JSON.parse(readFileSync(new URL('../angular.json', import.meta.url), 'utf8'));
  assert.ok(JSON.stringify(angular).includes('src/captions.scss'), 'the styles are part of the build');
});
