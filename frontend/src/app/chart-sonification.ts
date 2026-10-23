import { DEFAULT_VOLUME, browserAudioContext, clampVolume, playTone, resumeContext } from './sound-cues';
import type { AudioContextLike, AudioNodeLike, CueTone, GainLike, OscillatorLike } from './sound-cues';

/**
 * Listen to a chart (PS-26, stretch): a price series played as one sweeping tone, so a blind
 * trader can hear the trend. Price sets the pitch on a log scale (lowest price 220 Hz, highest
 * 880 Hz, two octaves) and time moves the sound from the left speaker to the right; the whole
 * series takes about 3 seconds. Trades can be marked as short clicks (buys higher, sells lower)
 * and the average cost as a quiet steady tone underneath.
 *
 * Space on a focused chart plays it and pressing again stops it. The app never starts it on its
 * own while the person prefers reduced motion or has paused live updates, and never before a key
 * press or click. The mapping is in pure functions so it is tested without audio.
 */

export interface PricePoint {
  /** ISO time or epoch milliseconds. */
  time: string | number;
  value: number;
}

export interface TradeMarker {
  time: string | number;
  side: 'buy' | 'sell';
}

export interface ScheduledPoint {
  /** When the point is heard, from the start of playback. */
  timeMs: number;
  frequency: number;
  /** Stereo position, -1 (left) to +1 (right). */
  pan: number;
}

export interface ScheduledMarker {
  timeMs: number;
  pan: number;
  side: 'buy' | 'sell';
}

export const LOW_HZ = 220;
export const HIGH_HZ = 880;
/** Half way up the log scale, where a flat series sits. */
export const MID_HZ = Math.sqrt(LOW_HZ * HIGH_HZ);
export const SERIES_MS = 3000;

/** Peak loudness of the price tone, the average-cost hum and the trade clicks, before volume. */
const SERIES_GAIN = 0.25;
const AVERAGE_COST_GAIN = 0.06;
const FADE_S = 0.03;
const SILENT = 0.0001;
/** Buys click high and sells click low, so the two can be told apart without seeing them. */
const CLICKS: Record<'buy' | 'sell', CueTone> = {
  buy: { atMs: 0, durationMs: 30, frequency: 1568, endFrequency: 1568, gain: 0.35, wave: 'square' },
  sell: { atMs: 0, durationMs: 30, frequency: 784, endFrequency: 784, gain: 0.35, wave: 'square' },
};
/** Time left after the last sound before playback counts as finished. */
const TAIL_MS = 60;

/** The pitch for a price: `min` → 220 Hz, `max` → 880 Hz, log scale between. A flat range is 440 Hz. */
export function pitchFor(value: number, min: number, max: number): number {
  if (!(max > min) || !Number.isFinite(value)) {
    return MID_HZ;
  }
  const position = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return LOW_HZ * (HIGH_HZ / LOW_HZ) ** position;
}

/** Stereo position of point `index` of `count`: the first on the left, the last on the right. */
export function panFor(index: number, count: number): number {
  if (count <= 1) {
    return 0;
  }
  return Math.min(1, Math.max(-1, -1 + (2 * index) / (count - 1)));
}

/** Points with a usable price; anything else is skipped rather than heard as a jump. */
function heard(points: readonly PricePoint[]): PricePoint[] {
  return points.filter((p) => p && Number.isFinite(p.value));
}

/** When, at what pitch and where each point is heard, over `durationMs`. */
export function schedule(points: readonly PricePoint[], durationMs = SERIES_MS): ScheduledPoint[] {
  const usable = heard(points);
  if (!usable.length) {
    return [];
  }
  const values = usable.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const count = usable.length;
  return usable.map((p, i) => ({
    timeMs: count > 1 ? (i * durationMs) / (count - 1) : 0,
    frequency: pitchFor(p.value, min, max),
    pan: panFor(i, count),
  }));
}

/** Epoch milliseconds for a point or marker time, or NaN. */
export function timeOf(time: string | number): number {
  return typeof time === 'number' ? time : Date.parse(time);
}

/**
 * When each trade is heard: at its place between the points either side of it, so a click lines
 * up with the price it was made at. Trades outside the series, or with unreadable times, are left out.
 */
export function markerSchedule(
  points: readonly PricePoint[],
  markers: readonly TradeMarker[],
  durationMs = SERIES_MS,
): ScheduledMarker[] {
  const times = heard(points).map((p) => timeOf(p.time));
  if (!times.length || times.some((t) => !Number.isFinite(t))) {
    return [];
  }
  const last = times.length - 1;
  const scheduled: ScheduledMarker[] = [];
  for (const marker of markers) {
    const at = timeOf(marker.time);
    const place = fractionalIndex(times, at);
    if (place === null) {
      continue;
    }
    scheduled.push({
      timeMs: last ? (place * durationMs) / last : 0,
      pan: last ? -1 + (2 * place) / last : 0,
      side: marker.side === 'sell' ? 'sell' : 'buy',
    });
  }
  return scheduled.sort((a, b) => a.timeMs - b.timeMs);
}

/** Where `at` falls among ascending `times`, as an index with a fraction, or null when outside. */
function fractionalIndex(times: number[], at: number): number | null {
  if (!Number.isFinite(at) || at < times[0] || at > times[times.length - 1]) {
    return null;
  }
  for (let i = 0; i < times.length - 1; i++) {
    if (at <= times[i + 1]) {
      const span = times[i + 1] - times[i];
      return span > 0 ? i + (at - times[i]) / span : i;
    }
  }
  return times.length - 1;
}

export interface SonifyOptions {
  /** Buys and sells to click at their time. */
  markers?: readonly TradeMarker[];
  /** Average cost per share, heard as a quiet steady tone; null or missing for none. */
  averageCost?: number | null;
  /** Length of the whole series; about 3 seconds by default. */
  durationMs?: number;
  /**
   * True when the app starts playback by itself (say, when new prices arrive) rather than the
   * person pressing Space. Automatic playback never happens with reduced motion, while live
   * updates are paused, or before the first key press or click.
   */
  auto?: boolean;
}

export interface ChartSonifierOptions {
  createContext?: () => AudioContextLike | null;
  /** The reduced motion preference; the system setting by default. */
  reducedMotion?: () => boolean;
  /** "Pause live updates" (PS-21). */
  paused?: () => boolean;
  /** The Listen to charts setting, if there is one. */
  enabled?: () => boolean;
  volume?: () => number;
  /** Called when playback ends on its own or is stopped, so a button can update. */
  onEnd?: () => void;
}

/** The system "reduce motion" setting; false where it cannot be read. */
export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** Plays charts as sound, one at a time. */
export class ChartSonifier {
  readonly #options: ChartSonifierOptions;
  #context: AudioContextLike | null = null;
  #unavailable = false;
  #unlocked = false;
  #sources: OscillatorLike[] = [];
  #output: GainLike | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ChartSonifierOptions = {}) {
    this.#options = options;
  }

  get playing(): boolean {
    return this.#output !== null;
  }

  /** Call from a key press or click, so later automatic playback is allowed by the browser. */
  unlock(): void {
    this.#unlocked = true;
    if (this.#options.enabled && !this.#options.enabled()) {
      return;
    }
    const context = this.#ensureContext();
    if (context) {
      resumeContext(context);
    }
  }

  /**
   * Plays the series, or stops it if it is already playing (Space toggles). Returns true when
   * playback started. A call that is not `auto` counts as the person's own action; an `auto`
   * call never interrupts playback the person started.
   */
  play(points: readonly PricePoint[], options: SonifyOptions = {}): boolean {
    if (this.playing) {
      if (!options.auto) {
        this.stop();
      }
      return false;
    }
    if (options.auto) {
      const reduced = (this.#options.reducedMotion ?? prefersReducedMotion)();
      if (!this.#unlocked || reduced || this.#options.paused?.()) {
        return false;
      }
    } else {
      this.#unlocked = true;
    }
    if (this.#options.enabled && !this.#options.enabled()) {
      return false;
    }
    const volume = clampVolume((this.#options.volume ?? (() => DEFAULT_VOLUME))());
    const durationMs = options.durationMs !== undefined && options.durationMs > 0 ? options.durationMs : SERIES_MS;
    const notes = schedule(points, durationMs);
    if (!notes.length || volume === 0) {
      return false;
    }
    const context = this.#ensureContext();
    if (!context) {
      return false;
    }
    try {
      resumeContext(context);
      this.#start(context, points, notes, options, durationMs, volume);
    } catch {
      this.#teardown();
      return false;
    }
    this.#timer = setTimeout(() => this.stop(), durationMs + TAIL_MS);
    return true;
  }

  /** Stops playback at once. Safe to call when nothing is playing. */
  stop(): void {
    if (!this.playing) {
      return;
    }
    this.#teardown();
    this.#options.onEnd?.();
  }

  /** Stops playback and releases the audio context. */
  dispose(): void {
    this.stop();
    const context = this.#context;
    this.#context = null;
    try {
      Promise.resolve(context?.close?.()).catch(() => undefined);
    } catch {
      // Already closed.
    }
  }

  #start(
    context: AudioContextLike,
    points: readonly PricePoint[],
    notes: ScheduledPoint[],
    options: SonifyOptions,
    durationMs: number,
    volume: number,
  ): void {
    const t0 = context.currentTime;
    const end = t0 + durationMs / 1000;
    const output = context.createGain();
    output.gain.setValueAtTime(volume, t0);
    output.connect(context.destination);
    this.#output = output;

    // The price line: one oscillator gliding between points, panned left to right.
    const line = context.createOscillator();
    line.type = 'triangle';
    line.frequency.setValueAtTime(notes[0].frequency, t0);
    for (const note of notes.slice(1)) {
      line.frequency.exponentialRampToValueAtTime(note.frequency, t0 + note.timeMs / 1000);
    }
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(SILENT, t0);
    envelope.gain.exponentialRampToValueAtTime(SERIES_GAIN, t0 + FADE_S);
    envelope.gain.setValueAtTime(SERIES_GAIN, end - FADE_S);
    envelope.gain.exponentialRampToValueAtTime(SILENT, end);
    line.connect(envelope);
    envelope.connect(this.#panned(context, output, notes[0].pan, notes[notes.length - 1].pan, t0, end));
    this.#begin(line, t0, end);

    // The average cost: a quiet steady hum at its pitch, in the middle.
    const cost = options.averageCost;
    if (typeof cost === 'number' && Number.isFinite(cost)) {
      const values = heard(points).map((p) => p.value);
      const hum = context.createOscillator();
      hum.type = 'sine';
      hum.frequency.setValueAtTime(pitchFor(cost, Math.min(...values), Math.max(...values)), t0);
      const level = context.createGain();
      level.gain.setValueAtTime(SILENT, t0);
      level.gain.exponentialRampToValueAtTime(AVERAGE_COST_GAIN, t0 + FADE_S);
      level.gain.setValueAtTime(AVERAGE_COST_GAIN, end - FADE_S);
      level.gain.exponentialRampToValueAtTime(SILENT, end);
      hum.connect(level);
      level.connect(output);
      this.#begin(hum, t0, end);
    }

    // Trades: a click each, at their place in the sweep.
    for (const marker of markerSchedule(points, options.markers ?? [], durationMs)) {
      const at = t0 + marker.timeMs / 1000;
      const click = playTone(context, this.#panned(context, output, marker.pan, marker.pan, at, at), CLICKS[marker.side], at, 1);
      this.#sources.push(click);
    }
  }

  /** A stereo panner from `from` to `to` feeding `output`, or `output` itself without stereo support. */
  #panned(context: AudioContextLike, output: AudioNodeLike, from: number, to: number, start: number, end: number): AudioNodeLike {
    if (typeof context.createStereoPanner !== 'function') {
      return output;
    }
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(from, start);
    if (to !== from) {
      panner.pan.linearRampToValueAtTime(to, end);
    }
    panner.connect(output);
    return panner;
  }

  #begin(source: OscillatorLike, start: number, end: number): void {
    source.start(start);
    source.stop(end);
    this.#sources.push(source);
  }

  #teardown(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    for (const source of this.#sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.#sources = [];
    this.#output?.disconnect();
    this.#output = null;
  }

  #ensureContext(): AudioContextLike | null {
    if (!this.#context && !this.#unavailable) {
      this.#context = (this.#options.createContext ?? browserAudioContext)();
      this.#unavailable = !this.#context;
    }
    return this.#context;
  }
}
