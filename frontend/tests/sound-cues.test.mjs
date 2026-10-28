import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeAudioContext, withAudioContext } from './fake-audio.mjs';
const {
  MAX_CUE_MS, SOUND_CUES, SoundCues, browserAudioContext, clampVolume, cueSpec, playTone,
} = await import('../src/app/sound-cues.ts');

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} ≈ ${expected}`);

/** A cue as heard: its notes' pitches, glides, timings and waveforms. */
const shape = (cue) => JSON.stringify(cueSpec(cue).tones.map(({ gain, ...rest }) => rest));

test('every cue is distinct and ends within half a second (PS-22)', () => {
  assert.deepEqual(SOUND_CUES, ['ring', 'fill', 'reject', 'keypad', 'warning']);
  const shapes = new Set(SOUND_CUES.map(shape));
  assert.equal(shapes.size, SOUND_CUES.length, 'no two cues sound the same');
  for (const cue of SOUND_CUES) {
    const spec = cueSpec(cue);
    assert.equal(spec.cue, cue);
    assert.ok(spec.totalMs > 0 && spec.totalMs < MAX_CUE_MS, `${cue} lasts ${spec.totalMs} ms`);
    for (const t of spec.tones) {
      assert.ok(t.gain > 0 && t.gain <= 1, `${cue} loudness is between 0 and 1`);
      assert.ok(t.frequency >= 20 && t.endFrequency >= 20, `${cue} is audible`);
    }
  }
});

test('the cues have the shapes the story asks for', () => {
  const [low, high] = cueSpec('fill').tones;
  assert.ok(high.frequency > low.frequency && high.atMs > low.atMs, 'fill rises over two notes');
  const [reject] = cueSpec('reject').tones;
  assert.ok(reject.endFrequency < reject.frequency, 'reject falls');
  assert.ok(reject.frequency < low.frequency, 'reject is lower than the fill chime');
  assert.ok(cueSpec('ring').totalMs <= 50 && cueSpec('keypad').totalMs <= 50, 'ring and keypad are short ticks');
  assert.ok(cueSpec('ring').tones[0].gain < cueSpec('fill').tones[0].gain, 'the ring tick is the softest');
  assert.equal(cueSpec('warning').tones.length, 2);
});

test('cueSpec hands out copies, so a caller cannot change a cue for everyone', () => {
  cueSpec('ring').tones[0].frequency = 5;
  assert.notEqual(cueSpec('ring').tones[0].frequency, 5);
});

test('volume is kept between 0 and 1', () => {
  assert.equal(clampVolume(0.4), 0.4);
  assert.equal(clampVolume(3), 1);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume(Number.NaN), 0);
});

test('no audio context is created before the person has used the page', (t) => {
  const contexts = withAudioContext(t);
  const cues = new SoundCues();
  assert.equal(cues.unlocked, false);
  assert.equal(cues.play('fill'), false);
  assert.equal(contexts.length, 0, 'playing before a gesture creates nothing');
  cues.unlock();
  assert.equal(cues.unlocked, true);
  assert.equal(contexts.length, 1, 'the gesture creates the context');
  assert.equal(contexts[0].resumes, 1, 'and starts it');
  assert.equal(cues.play('fill'), true);
  assert.equal(cues.play('ring'), true);
  assert.equal(contexts.length, 1, 'one context is shared by every cue');
});

test('a cue schedules its notes with a fade in and out, scaled by the volume', (t) => {
  const contexts = withAudioContext(t);
  let volume = 0.5;
  const cues = new SoundCues({ volume: () => volume });
  cues.unlock();
  const context = contexts[0];
  context.currentTime = 2;
  assert.equal(cues.play('fill'), true);
  const [first, second] = context.oscillators();
  assert.equal(context.oscillators().length, 2);
  near(first.startedAt, 2, 'starts now on the audio clock');
  near(second.startedAt, 2.13, 'the second note comes 130 ms later');
  near(first.stops[0], 2.16);
  assert.deepEqual(first.frequency.events, [['set', 659.25, 2]]);
  const envelope = first.connections[0];
  assert.equal(envelope.kind, 'gain');
  assert.deepEqual(envelope.connections, [context.destination]);
  const peak = envelope.gain.events.find(([kind, value]) => kind === 'exp' && value > 0.01);
  assert.equal(peak[1], 0.3 * 0.5);
  const [kind, level, at] = envelope.gain.events.at(-1);
  assert.deepEqual([kind, level], ['exp', 0.0001], 'fades out');
  near(at, 2.16, 'by the end of the note');

  cues.play('reject');
  const glide = context.oscillators()[2];
  assert.equal(glide.type, 'triangle');
  assert.equal(glide.frequency.events.at(-1)[1], 185, 'the reject tone falls');
  near(glide.frequency.events.at(-1)[2], 2.38);

  const before = context.nodes.length;
  volume = 0;
  assert.equal(cues.play('fill'), false, 'volume 0 is silent');
  assert.equal(context.nodes.length, before, 'and creates no nodes');
});

test('turned off, cues create no context and no nodes, even after a gesture', (t) => {
  const contexts = withAudioContext(t);
  let on = false;
  const cues = new SoundCues({ enabled: () => on });
  cues.unlock();
  assert.equal(contexts.length, 0);
  assert.equal(cues.play('ring'), false);
  assert.equal(contexts.length, 0);
  on = true;
  assert.equal(cues.play('ring'), true, 'turning them on works without another gesture');
  const nodes = contexts[0].nodes.length;
  on = false;
  assert.equal(cues.play('keypad'), false);
  assert.equal(contexts[0].nodes.length, nodes, 'turning them off again stops new nodes at once');
});

test('without Web Audio every call quietly does nothing', (t) => {
  withAudioContext(t, null);
  assert.equal(browserAudioContext(), null);
  let asked = 0;
  const cues = new SoundCues({ createContext: () => { asked += 1; return browserAudioContext(); } });
  assert.doesNotThrow(() => cues.unlock());
  assert.equal(cues.play('fill'), false);
  assert.equal(cues.play('reject'), false);
  assert.equal(asked, 1, 'a missing Web Audio is not looked for again on every cue');
  assert.doesNotThrow(() => cues.dispose());
});

test('a browser that refuses to make a context, or fails mid-cue, stays silent', (t) => {
  withAudioContext(t, class { constructor() { throw new Error('blocked'); } });
  assert.equal(browserAudioContext(), null);
  const broken = new FakeAudioContext();
  broken.createOscillator = () => { throw new Error('gone'); };
  broken.resume = () => { throw new Error('not allowed'); };
  const cues = new SoundCues({ createContext: () => broken });
  cues.unlock();
  assert.equal(cues.play('fill'), false);
});

test('an unknown cue is ignored', (t) => {
  const contexts = withAudioContext(t);
  const cues = new SoundCues();
  cues.unlock();
  assert.equal(cues.play('applause'), false);
  assert.equal(contexts[0].nodes.length, 0);
});

test('the first key press or click unlocks sound, once', (t) => {
  const contexts = withAudioContext(t);
  const listeners = new Map();
  const target = {
    addEventListener: (type, fn, options) => { listeners.set(type, fn); assert.equal(options.capture, true); },
    removeEventListener: (type) => listeners.delete(type),
  };
  const cues = new SoundCues();
  cues.unlockOnGesture(target);
  assert.deepEqual([...listeners.keys()], ['keydown', 'pointerdown']);
  listeners.get('pointerdown')();
  assert.equal(cues.unlocked, true);
  assert.equal(listeners.size, 0, 'it stops listening after the first gesture');
  assert.equal(contexts.length, 1);

  const other = new SoundCues();
  const stop = other.unlockOnGesture(target);
  stop();
  assert.equal(listeners.size, 0, 'the returned function stops listening');
  assert.doesNotThrow(() => new SoundCues().unlockOnGesture(undefined)());
});

test('dispose closes the context, and the next cue after a gesture makes a new one', (t) => {
  const contexts = withAudioContext(t);
  const cues = new SoundCues();
  cues.unlock();
  cues.dispose();
  assert.equal(contexts[0].closed, true);
  assert.equal(cues.play('ring'), true);
  assert.equal(contexts.length, 2);
});

test('playTone can feed another node, for the chart sonification clicks', () => {
  const context = new FakeAudioContext();
  const target = context.createGain();
  const oscillator = playTone(context, target, cueSpec('keypad').tones[0], 1, 2);
  assert.deepEqual(oscillator.connections[0].connections, [target]);
  const peak = oscillator.connections[0].gain.events[1];
  assert.equal(peak[1], 0.2, 'volume above 1 is treated as 1');
  assert.ok(peak[2] - 1 <= 0.0125 + 1e-9, 'the fade-in never takes more than half a short note');
});
