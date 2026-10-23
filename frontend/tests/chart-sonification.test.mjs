import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeAudioContext, withAudioContext } from './fake-audio.mjs';
// Registers the loader that resolves the app's extensionless imports, such as './sound-cues'.
import './component-helper.mjs';
const {
  ChartSonifier, HIGH_HZ, LOW_HZ, MID_HZ, SERIES_MS, markerSchedule, panFor, pitchFor, prefersReducedMotion, schedule, timeOf,
} = await import('../src/app/chart-sonification.ts');

const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-6, `${message} ${actual} ≈ ${expected}`);
const day = (n) => `2026-10-${String(n).padStart(2, '0')}T14:30:00.000Z`;
const SERIES = [100, 104, 98, 110, 120].map((value, i) => ({ time: day(i + 1), value }));

/** A sonifier with a fake context it hands out, so a test can look at what was scheduled. */
function sonifier(options = {}) {
  const contexts = [];
  const player = new ChartSonifier({
    createContext: () => { const c = new FakeAudioContext(); contexts.push(c); return c; },
    reducedMotion: () => false,
    ...options,
  });
  return { player, contexts };
}

test('prices map to pitch on a log scale from 220 to 880 Hz (PS-26)', () => {
  assert.equal(pitchFor(50, 50, 150), LOW_HZ, 'the lowest price is 220 Hz');
  assert.equal(pitchFor(150, 50, 150), HIGH_HZ, 'the highest price is 880 Hz');
  near(pitchFor(100, 50, 150), 440, 'half way up the range is one octave up, not 550 Hz');
  near(pitchFor(75, 50, 150), 220 * Math.SQRT2, 'a quarter of the way is half an octave');
  assert.equal(pitchFor(10, 50, 150), LOW_HZ, 'values outside the range are held at the ends');
  assert.equal(pitchFor(999, 50, 150), HIGH_HZ);
  assert.equal(MID_HZ, 440);
  assert.equal(pitchFor(42, 42, 42), MID_HZ, 'a flat range is a steady mid pitch');
  assert.equal(pitchFor(Number.NaN, 1, 2), MID_HZ);
});

test('time maps to stereo position from left to right', () => {
  assert.equal(panFor(0, 5), -1);
  assert.equal(panFor(4, 5), 1);
  assert.equal(panFor(2, 5), 0);
  assert.equal(panFor(0, 1), 0, 'a single point is in the middle');
  assert.equal(panFor(0, 0), 0);
  assert.equal(panFor(9, 5), 1, 'held at the right edge');
});

test('the whole series is scheduled over about 3 seconds', () => {
  const notes = schedule(SERIES);
  assert.equal(notes.length, 5);
  assert.deepEqual(notes.map((n) => n.timeMs), [0, 750, 1500, 2250, 3000]);
  assert.deepEqual(notes.map((n) => n.pan), [-1, -0.5, 0, 0.5, 1]);
  assert.equal(notes[2].frequency, LOW_HZ, 'the low of 98 is the lowest pitch');
  assert.equal(notes[4].frequency, HIGH_HZ, 'the high of 120 is the highest pitch');
  assert.ok(notes[1].frequency > notes[0].frequency, 'a rise is heard as a rise');
  assert.equal(SERIES_MS, 3000);
  assert.deepEqual(schedule(SERIES, 1000).map((n) => n.timeMs), [0, 250, 500, 750, 1000]);
});

test('flat, single-point, empty and gappy series', () => {
  const flat = schedule([{ time: 1, value: 5 }, { time: 2, value: 5 }, { time: 3, value: 5 }]);
  assert.ok(flat.every((n) => n.frequency === MID_HZ), 'a flat series is a steady mid pitch');
  assert.deepEqual(schedule([{ time: 1, value: 7 }]), [{ timeMs: 0, frequency: MID_HZ, pan: 0 }]);
  assert.deepEqual(schedule([]), [], 'nothing to schedule');
  const gaps = schedule([{ time: 1, value: 1 }, { time: 2, value: Number.NaN }, null, { time: 3, value: 2 }]);
  assert.deepEqual(gaps.map((n) => n.pan), [-1, 1], 'unusable points are skipped');
});

test('trades click at their place in the sweep, buys and sells apart', () => {
  assert.equal(timeOf(5), 5);
  assert.equal(timeOf(day(1)), Date.parse(day(1)));
  const between = new Date((Date.parse(day(2)) + Date.parse(day(3))) / 2).toISOString();
  const markers = markerSchedule(SERIES, [
    { time: day(5), side: 'sell' },
    { time: between, side: 'buy' },
    { time: day(9), side: 'buy' },
    { time: 'not a date', side: 'buy' },
  ]);
  assert.equal(markers.length, 2, 'trades outside the series or with bad times are left out');
  assert.deepEqual(markers[0], { timeMs: 1125, pan: -0.25, side: 'buy' }, 'half way between points 2 and 3');
  assert.deepEqual(markers[1], { timeMs: 3000, pan: 1, side: 'sell' });
  assert.deepEqual(markerSchedule([], [{ time: 1, side: 'buy' }]), []);
  assert.deepEqual(markerSchedule([{ time: 'x', value: 1 }], [{ time: 1, side: 'buy' }]), [], 'unreadable point times');
  assert.deepEqual(markerSchedule([{ time: 1, value: 1 }], [{ time: 1, side: 'sell' }]), [{ timeMs: 0, pan: 0, side: 'sell' }]);
  const twice = [{ time: 1, value: 1 }, { time: 1, value: 2 }, { time: 2, value: 3 }];
  assert.deepEqual(markerSchedule(twice, [{ time: 1, side: 'buy' }]).map((m) => m.timeMs), [0]);
});

test('playing schedules a gliding, panned tone with a click per trade and a quiet average-cost hum', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let ended = 0;
  const { player, contexts } = sonifier({ volume: () => 0.5, onEnd: () => { ended += 1; } });
  assert.equal(player.play(SERIES, { markers: [{ time: day(3), side: 'buy' }], averageCost: 104 }), true);
  assert.equal(player.playing, true);
  const [context] = contexts;
  const [line, hum, click] = context.oscillators();
  assert.equal(context.oscillators().length, 3);
  assert.deepEqual(line.frequency.events.map(([kind]) => kind), ['set', 'exp', 'exp', 'exp', 'exp']);
  assert.equal(line.frequency.events.at(-1)[1], HIGH_HZ);
  assert.equal(line.frequency.events.at(-1)[2], 3);
  const panner = line.connections[0].connections[0];
  assert.equal(panner.kind, 'panner');
  assert.deepEqual(panner.pan.events, [['set', -1, 0], ['linear', 1, 3]], 'moves from left to right');
  const output = panner.connections[0];
  assert.deepEqual(output.gain.events, [['set', 0.5, 0]], 'the volume setting is applied once, to everything');
  assert.deepEqual(output.connections, [context.destination]);
  near(hum.frequency.events[0][1], pitchFor(104, 98, 120), 'the hum sits at the average cost');
  assert.ok(hum.connections[0].gain.events.every(([, level]) => level <= 0.06), 'and stays quiet');
  assert.equal(click.frequency.events[0][1], 1568, 'a buy clicks high');
  assert.equal(click.startedAt, 1.5);

  t.mock.timers.tick(SERIES_MS + 100);
  assert.equal(player.playing, false, 'it finishes on its own');
  assert.equal(ended, 1);
  assert.equal(output.disconnected, true);
});

test('pressing again stops it, and a third press plays it again', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let ended = 0;
  const { player, contexts } = sonifier({ onEnd: () => { ended += 1; } });
  assert.equal(player.play(SERIES), true);
  const oscillators = contexts[0].oscillators();
  assert.equal(player.play(SERIES), false, 'the second press stops');
  assert.equal(player.playing, false);
  assert.equal(ended, 1);
  assert.ok(oscillators.every((o) => o.stops.length === 2), 'every sound is stopped at once');
  assert.equal(player.play(SERIES), true, 'the third press plays again');
  assert.equal(contexts.length, 1, 'with the same audio context');
  player.stop();
  player.stop();
  assert.equal(ended, 2, 'stopping when nothing plays does nothing');
  t.mock.timers.tick(SERIES_MS * 2);
  assert.equal(ended, 2, 'the finished timer was cancelled');
});

test('the app never starts it by itself before a gesture, with reduced motion, or while paused', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reduced = false;
  let paused = false;
  const { player, contexts } = sonifier({ reducedMotion: () => reduced, paused: () => paused });
  assert.equal(player.play(SERIES, { auto: true }), false, 'no sound before the person has used the page');
  assert.equal(contexts.length, 0);
  player.unlock();
  assert.equal(player.play(SERIES, { auto: true }), true);
  player.stop();
  reduced = true;
  assert.equal(player.play(SERIES, { auto: true }), false, 'reduced motion: no autoplay');
  assert.equal(player.play(SERIES), true, 'but pressing Space still plays');
  assert.equal(player.play(SERIES, { auto: true }), false, 'an automatic play does not stop the person’s');
  assert.equal(player.playing, true);
  player.stop();
  reduced = false;
  paused = true;
  assert.equal(player.play(SERIES, { auto: true }), false, 'live updates paused: no autoplay');
  assert.equal(player.play(SERIES), true);
});

test('pressing Space counts as the gesture that unlocks later automatic playback', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player } = sonifier();
  assert.equal(player.play(SERIES), true);
  player.stop();
  assert.equal(player.play(SERIES, { auto: true }), true);
});

test('reduced motion follows the system setting', (t) => {
  const before = globalThis.matchMedia;
  t.after(() => { globalThis.matchMedia = before; });
  const asked = [];
  globalThis.matchMedia = (query) => { asked.push(query); return { matches: true }; };
  assert.equal(prefersReducedMotion(), true);
  assert.deepEqual(asked, ['(prefers-reduced-motion: reduce)']);
  globalThis.matchMedia = () => { throw new Error('unsupported'); };
  assert.equal(prefersReducedMotion(), false);
  globalThis.matchMedia = undefined;
  assert.equal(prefersReducedMotion(), false);

  globalThis.matchMedia = () => ({ matches: true });
  const { player } = sonifier({ reducedMotion: undefined });
  player.unlock();
  assert.equal(player.play(SERIES, { auto: true }), false, 'the default reads the system setting');
});

test('nothing is played for an empty series, when turned off, or at volume 0', (t) => {
  withAudioContext(t);
  let on = false;
  const { player, contexts } = sonifier({ enabled: () => on });
  player.unlock();
  assert.equal(contexts.length, 0, 'turned off, unlocking makes no context');
  assert.equal(player.play(SERIES), false);
  on = true;
  assert.equal(player.play([]), false);
  assert.equal(player.playing, false);
  const quiet = sonifier({ volume: () => 0 });
  assert.equal(quiet.player.play(SERIES), false);
  assert.equal(quiet.contexts.length, 0);
});

test('without Web Audio, or when it fails, playing quietly does nothing', (t) => {
  withAudioContext(t, null);
  const player = new ChartSonifier({ reducedMotion: () => false });
  assert.doesNotThrow(() => player.unlock());
  assert.equal(player.play(SERIES), false);
  assert.equal(player.playing, false);
  assert.doesNotThrow(() => player.dispose());

  const broken = new FakeAudioContext();
  broken.createOscillator = () => { throw new Error('gone'); };
  const failing = new ChartSonifier({ createContext: () => broken });
  assert.equal(failing.play(SERIES), false);
  assert.equal(failing.playing, false);
});

test('a single point plays a steady centred tone; old browsers without stereo still play', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const contexts = [];
  const player = new ChartSonifier({
    createContext: () => { const c = new FakeAudioContext({ panner: false }); contexts.push(c); return c; },
    reducedMotion: () => false,
  });
  assert.equal(player.play([{ time: 1, value: 3 }], { markers: [{ time: 1, side: 'sell' }], durationMs: Number.NaN }), true);
  const [line, click] = contexts[0].oscillators();
  assert.deepEqual(line.frequency.events, [['set', MID_HZ, 0]]);
  assert.deepEqual(line.stops, [SERIES_MS / 1000], 'a bad length falls back to about 3 seconds');
  assert.equal(click.frequency.events[0][1], 784, 'a sell clicks low');
  assert.equal(line.connections[0].connections[0].kind, 'gain', 'no panner: straight to the output');
  player.dispose();
  assert.equal(player.playing, false);
  assert.equal(contexts[0].closed, true);
});
