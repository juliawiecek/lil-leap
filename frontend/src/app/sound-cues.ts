/**
 * Sound cues (PS-22): short sounds for common events, so a voice mode or switch control user gets
 * feedback without waiting for speech. Every sound is made with Web Audio, so there are no sound
 * files to load.
 *
 * - `ring`: a soft high tick when the switch-control ring moves.
 * - `fill`: a rising two-note chime when an order fills.
 * - `reject`: a low falling tone when an order is rejected.
 * - `keypad`: a soft click when a switch-control keypad opens.
 * - `warning`: two even beeps when the "Still there?" inactivity warning opens.
 *
 * Browsers only allow audio after the person has used the page, so nothing is created until
 * `unlock()` has been called from a key press or click (`unlockOnGesture` wires that up). Without
 * Web Audio every call quietly does nothing. Sound cues have their own on/off setting, separate
 * from speech, and every cue also has a spoken or written message, so nothing relies on sound alone.
 */

export type SoundCue = 'ring' | 'fill' | 'reject' | 'keypad' | 'warning';
export const SOUND_CUES: readonly SoundCue[] = ['ring', 'fill', 'reject', 'keypad', 'warning'];

export type Waveform = 'sine' | 'triangle' | 'square';

/** One note in a cue. Times are in milliseconds from the start of the cue. */
export interface CueTone {
  atMs: number;
  durationMs: number;
  /** Pitch at the start of the note, in Hz. */
  frequency: number;
  /** Pitch at the end; different from `frequency` for a glide. */
  endFrequency: number;
  /** Peak loudness from 0 to 1, before the volume setting is applied. */
  gain: number;
  wave: Waveform;
}

export interface CueSpec {
  cue: SoundCue;
  tones: CueTone[];
  /** When the last note ends, in milliseconds. */
  totalMs: number;
}

/** Every cue must end within this, so a cue never talks over the speech that follows it. */
export const MAX_CUE_MS = 500;
/** Volume used when no setting is passed in. */
export const DEFAULT_VOLUME = 0.8;
/** Fade-in time, long enough to avoid a click at the start of a note. */
const ATTACK_MS = 5;
/** Web Audio cannot ramp exponentially to zero, so notes fade to this instead. */
const SILENT = 0.0001;

function tone(atMs: number, durationMs: number, frequency: number, gain: number, wave: Waveform, endFrequency = frequency): CueTone {
  return { atMs, durationMs, frequency, endFrequency, gain, wave };
}

const TONES: Record<SoundCue, CueTone[]> = {
  // Barely there: the ring moves every second or so, and a louder tick would tire the listener.
  ring: [tone(0, 35, 1760, 0.12, 'sine')],
  // E5 then A5, overlapping slightly: the rising interval reads as good news.
  fill: [tone(0, 160, 659.25, 0.3, 'sine'), tone(130, 260, 880, 0.3, 'sine')],
  // A low tone that falls from E flat 4 to about F sharp 3: something did not go through.
  reject: [tone(0, 380, 311.13, 0.32, 'triangle', 185)],
  // Lower, shorter and woodier than the ring tick, so the two are never confused.
  keypad: [tone(0, 25, 520, 0.2, 'triangle', 420)],
  // Two even mid beeps: asks for attention without sounding like an alarm.
  warning: [tone(0, 110, 784, 0.25, 'triangle'), tone(190, 110, 784, 0.25, 'triangle')],
};

/** The notes a cue plays: pitches, timings and loudness. Pure, so the shapes are tested without audio. */
export function cueSpec(cue: SoundCue): CueSpec {
  const tones = TONES[cue].map((t) => ({ ...t }));
  return { cue, tones, totalMs: Math.max(...tones.map((t) => t.atMs + t.durationMs)) };
}

/** A volume between 0 and 1; anything that is not a number is silent. */
export function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
}

// The parts of Web Audio these modules use. Tests pass a fake context with the same shape.
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}
export interface OscillatorLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}
export interface PannerLike extends AudioNodeLike {
  pan: AudioParamLike;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  /** Missing in some older browsers; sounds then play in the centre. */
  createStereoPanner?(): PannerLike;
  resume(): Promise<void>;
  close?(): Promise<void>;
}

type AudioContextConstructor = new () => unknown;

/** The browser's audio context, or null when Web Audio is missing or refuses to start. */
export function browserAudioContext(): AudioContextLike | null {
  const scope = globalThis as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (typeof Context !== 'function') {
    return null;
  }
  try {
    return new Context() as AudioContextLike;
  } catch {
    return null;
  }
}

/** Starts a suspended context; a refusal is ignored, since sounds are never essential. */
export function resumeContext(context: AudioContextLike): void {
  if (context.state !== 'suspended') {
    return;
  }
  try {
    Promise.resolve(context.resume()).catch(() => undefined);
  } catch {
    // Some browsers throw instead of rejecting; the next gesture tries again.
  }
}

/**
 * Schedules one note, starting `startAt` seconds on the context's clock, through `destination`.
 * Returns the oscillator so a caller can stop it early.
 */
export function playTone(
  context: AudioContextLike,
  destination: AudioNodeLike,
  note: CueTone,
  startAt: number,
  volume: number,
): OscillatorLike {
  const start = startAt + note.atMs / 1000;
  const end = start + note.durationMs / 1000;
  const peak = Math.max(SILENT, note.gain * clampVolume(volume));
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = note.wave;
  oscillator.frequency.setValueAtTime(note.frequency, start);
  if (note.endFrequency !== note.frequency) {
    oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, end);
  }
  envelope.gain.setValueAtTime(SILENT, start);
  envelope.gain.exponentialRampToValueAtTime(peak, start + Math.min(ATTACK_MS, note.durationMs / 2) / 1000);
  envelope.gain.exponentialRampToValueAtTime(SILENT, end);
  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(start);
  oscillator.stop(end);
  return oscillator;
}

export interface SoundCueOptions {
  /** The Sound cues setting; read on every cue so turning it off takes effect at once. */
  enabled?: () => boolean;
  /** The volume setting, 0 to 1. */
  volume?: () => number;
  /** Where the audio context comes from; tests pass a fake. */
  createContext?: () => AudioContextLike | null;
}

/** Something that delivers key presses and clicks, usually the document. */
export interface GestureTarget {
  addEventListener(type: string, listener: () => void, options?: { capture?: boolean; passive?: boolean }): void;
  removeEventListener(type: string, listener: () => void, options?: { capture?: boolean }): void;
}

const GESTURES = ['keydown', 'pointerdown'];

/** Plays the cues. One instance per app is enough; the audio context is shared by every cue. */
export class SoundCues {
  readonly #enabled: () => boolean;
  readonly #volume: () => number;
  readonly #createContext: () => AudioContextLike | null;
  #context: AudioContextLike | null = null;
  #unavailable = false;
  #unlocked = false;

  constructor(options: SoundCueOptions = {}) {
    this.#enabled = options.enabled ?? (() => true);
    this.#volume = options.volume ?? (() => DEFAULT_VOLUME);
    this.#createContext = options.createContext ?? browserAudioContext;
  }

  /** True once the person has pressed a key or clicked, so the browser allows sound. */
  get unlocked(): boolean {
    return this.#unlocked;
  }

  /**
   * Call from a key press or click. Browsers that insist the audio context is created inside the
   * gesture (Safari) get it now; while cues are off nothing is created until one is played.
   */
  unlock(): void {
    this.#unlocked = true;
    if (this.#enabled()) {
      const context = this.#ensureContext();
      if (context) {
        resumeContext(context);
      }
    }
  }

  /** Unlocks on the first key press or click on `target`. Returns a function that stops listening. */
  unlockOnGesture(target: GestureTarget | undefined = globalThis.document): () => void {
    if (!target) {
      return () => undefined;
    }
    const listener = () => {
      this.unlock();
      stop();
    };
    const stop = () => GESTURES.forEach((type) => target.removeEventListener(type, listener, { capture: true }));
    GESTURES.forEach((type) => target.addEventListener(type, listener, { capture: true, passive: true }));
    return stop;
  }

  /** Plays a cue. Returns false, silently, when cues are off, locked, muted or unavailable. */
  play(cue: SoundCue): boolean {
    if (!this.#unlocked || !Object.hasOwn(TONES, cue) || !this.#enabled()) {
      return false;
    }
    const volume = clampVolume(this.#volume());
    if (volume === 0) {
      return false;
    }
    const context = this.#ensureContext();
    if (!context) {
      return false;
    }
    try {
      resumeContext(context);
      const startAt = context.currentTime;
      for (const note of TONES[cue]) {
        playTone(context, context.destination, note, startAt, volume);
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Releases the audio context, for example when the app is torn down. */
  dispose(): void {
    const context = this.#context;
    this.#context = null;
    try {
      Promise.resolve(context?.close?.()).catch(() => undefined);
    } catch {
      // Already closed.
    }
  }

  #ensureContext(): AudioContextLike | null {
    if (!this.#context && !this.#unavailable) {
      this.#context = this.#createContext();
      // Without Web Audio, stop asking: every later cue is a no-op.
      this.#unavailable = !this.#context;
    }
    return this.#context;
  }
}
