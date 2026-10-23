import assert from 'node:assert/strict';
import { test } from 'node:test';
const { SpeechCoordinator } = await import('../../shared/speech-coordinator.ts');

/** A speech engine stand-in: records utterances; nothing starts or ends until the test says so. */
export function withSynth(t) {
  const spoken = [];
  const synth = { speaking: false, paused: false, speak: (u) => spoken.push(u), cancel() {}, getVoices: () => [{ localService: true, voiceURI: 'local', default: true }] };
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

test('observers hear each phrase start and end, queued phrases in the order they are read (PS-23)', (t) => {
  const { spoken, Utterance } = withSynth(t);
  const speech = new SpeechCoordinator();
  const events = [];
  const stop = speech.observe((e) => events.push(`${e.phase}:${e.owner}:${e.text}`));
  speech.channel('briefing').speak(new Utterance('One.'));
  speech.channel('briefing').speak(new Utterance('Two.'));
  assert.deepEqual(events, ['start:briefing:One.'], 'the queued sentence has not started yet');
  spoken[0].onend?.({});
  assert.deepEqual(events.slice(1), ['end:briefing:One.', 'start:briefing:Two.'], 'the next sentence starts as the first ends');
  spoken[1].onstart?.({});
  assert.equal(events.length, 3, 'the browser saying it started changes nothing; it is reported once');
  spoken[1].onend?.({});
  spoken[1].onerror?.({});
  assert.deepEqual(events.slice(3), ['end:briefing:Two.'], 'a late error after the end is not reported again');
  stop();
  speech.channel('switch').speak(new Utterance('Menu group'));
  assert.equal(events.length, 4, 'no longer observing');
});

test('an interruption ends what was playing and starts the new phrase; queued phrases that never began are not reported', (t) => {
  const { spoken, Utterance } = withSynth(t);
  const speech = new SpeechCoordinator();
  const events = [];
  speech.observe((e) => events.push(`${e.phase}:${e.owner}:${e.text}`));
  speech.channel('switch').speak(new Utterance('Trade group'));
  speech.channel('switch').speak(new Utterance('Buy'));
  const original = [];
  const readBack = new Utterance("You're about to buy 2 shares of Apple.");
  readBack.onstart = () => original.push('start');
  assert.equal(speech.submit('readback', readBack, { interrupt: true }), true);
  assert.deepEqual(events, ['start:switch:Trade group', 'end:switch:Trade group', "start:readback:You're about to buy 2 shares of Apple."]);
  spoken.at(-1).onstart({});
  assert.deepEqual(original, ['start'], "the speaker's own onstart still runs");
  assert.equal(speech.submit('assist:hover', new Utterance('Buying power')), false, 'a polite reader never cuts in');
  assert.equal(events.length, 3, 'nothing unspoken is reported');
  speech.stop();
  assert.equal(events.at(-1), "end:readback:You're about to buy 2 shares of Apple.");
});
