import { Injectable, inject, signal } from '@angular/core';
import { accessibilityStore } from './accessibility';

/**
 * One voice for the whole app (PS-23). Everything NextTrade says aloud goes through SpeechService:
 * switch control reading each item, the order read-back, the market briefing and "What's this?"
 * (Alt+W). Going through one place means speech never talks over itself, and each sentence is
 * shown in a caption strip at the bottom of the screen while it is spoken and for a few seconds
 * after, for anyone who cannot hear it or missed a word.
 *
 * - `speak(text, { priority })`: 'polite' (the default) never cuts off anything else, so the ring
 *   stays quiet while the briefing talks; 'urgent' (the order read-back, a briefing the user asked
 *   for) stops whatever is playing and speaks now.
 * - `caption`: a signal of the sentence being spoken, or the last one for 4 s after; '' when none.
 * - `cancel()`: stops everything (or only a given source's speech).
 *
 * Voice mode (PS-22) builds on the same service.
 */

export type SpeechPriority = 'polite' | 'urgent';

export interface SpeakOptions {
  /** 'polite' waits its turn and never interrupts; 'urgent' cuts in. Default 'polite'. */
  priority?: SpeechPriority;
  /**
   * Who is speaking ('switch', 'briefing', 'glossary' ...). A polite sentence replaces the same
   * speaker's previous one (the ring moving on), but never another speaker's.
   */
  source?: string;
  /** Wait for what is being said instead of replacing it, e.g. the next sentence of the briefing. */
  queue?: boolean;
  /** Voice speed; 1 is normal. */
  rate?: number;
  onStart?: () => void;
  /** Called when the sentence finishes, fails or is cut off. */
  onEnd?: () => void;
}

export interface CaptionSettings {
  /** Show what is said in the caption strip. On unless turned off in Settings. */
  show: boolean;
}

/** Saved caption settings; captions are on unless they were turned off. */
export function parseCaptionSettings(saved: unknown): CaptionSettings {
  return { show: (saved as Partial<CaptionSettings> | null)?.show !== false };
}

/** How long a caption stays after its sentence has been spoken. */
export const CAPTION_HOLD_MS = 4000;
/** Space kept between the caption strip and anything moved up above it. */
const CAPTION_GAP_PX = 8;
const MIN_SPEECH_MS = 4000;
const MS_PER_CHARACTER = 150;
const MAX_SPEECH_MS = 30000;

/**
 * The longest a sentence is expected to take. Speech normally ends when the browser says so; this
 * cap only matters if the speech engine stalls. Generous on purpose: Chrome can take a few seconds
 * to start, and reads amounts like "$24,550.68" slowly.
 */
export function speechTime(text: string, rate = 1): number {
  return Math.min(MIN_SPEECH_MS + (text.length * MS_PER_CHARACTER) / rate, MAX_SPEECH_MS);
}

interface Spoken {
  utterance: SpeechSynthesisUtterance;
  source: string;
  priority: SpeechPriority;
  /** When it should have finished at the latest. */
  until: number;
}

@Injectable({ providedIn: 'root' })
export class SpeechService {
  readonly #store = accessibilityStore();
  readonly settings = signal<CaptionSettings>(this.#store.read('captions', parseCaptionSettings));
  /** The sentence being spoken, or the last one for a few seconds after; '' when there is none. */
  readonly caption = signal('');
  /** True while anything is being spoken. */
  readonly speaking = signal(false);
  /** What has been handed to the browser and not finished yet, in the order it will be read. */
  #active: Spoken[] = [];
  /** When the last queued sentence should have finished. */
  #until = 0;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  #strip: CaptionStrip | null = null;

  get supported(): boolean {
    return !!globalThis.speechSynthesis && typeof globalThis.SpeechSynthesisUtterance === 'function';
  }

  /** Turns the caption strip on or off; saved in the Accessibility settings store. */
  setCaptions(show: boolean): void {
    const next = { show };
    this.settings.set(next);
    this.#store.write('captions', next);
    if (show && this.caption()) {
      this.#strip?.show(this.caption());
    } else if (!show) {
      this.#strip?.hide();
    } else {
      // Nothing is being said, so there is nothing to show yet.
    }
  }

  /**
   * Says a sentence and captions it. Returns false when it was not spoken: a polite sentence while
   * someone else is talking, or a browser that cannot speak (the caption still shows then).
   */
  speak(text: string, options: SpeakOptions = {}): boolean {
    const sentence = text.trim();
    if (!sentence) {
      return false;
    }
    const { priority = 'polite', source = 'app', queue = false, rate = 1 } = options;
    if (!this.supported) {
      this.#show(sentence, speechTime(sentence, rate) + CAPTION_HOLD_MS);
      return false;
    }
    const synth = globalThis.speechSynthesis;
    this.#prune();
    if (priority === 'polite' && !this.#mayTalk(synth, source, queue)) {
      return false;
    }
    if (!queue && (priority === 'urgent' || this.#active.length)) {
      // Urgent cuts everything off; polite only gets here to replace its own speaker's sentence.
      synth.cancel();
      this.#active = [];
    }
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = rate;
    const from = queue ? Math.max(Date.now(), this.#until) : Date.now();
    const entry: Spoken = { utterance, source, priority, until: from + speechTime(sentence, rate) };
    this.#until = entry.until;
    utterance.onstart = () => {
      this.#show(sentence, entry.until - Date.now() + CAPTION_HOLD_MS);
      options.onStart?.();
    };
    const done = () => {
      this.#finished(entry);
      options.onEnd?.();
    };
    utterance.onend = done;
    utterance.onerror = done;
    this.#active.push(entry);
    this.speaking.set(true);
    if (this.#active.length === 1) {
      // Nothing ahead of it, so it starts now; captioned straight away in case onstart is late.
      this.#show(sentence, entry.until - Date.now() + CAPTION_HOLD_MS);
    }
    synth.speak(utterance);
    return true;
  }

  /** Stops speaking. With a source, only when that speaker is talking (the browser has one queue). */
  cancel(source?: string): void {
    this.#prune();
    if (source && !this.#active.some((a) => a.source === source)) {
      return;
    }
    if (this.supported) {
      globalThis.speechSynthesis.cancel();
    }
    this.#active = [];
    this.speaking.set(false);
    if (this.caption()) {
      this.#hideLater(CAPTION_HOLD_MS);
    }
  }

  /**
   * Whether something is still being said that a speaker should wait for: its own sentences and
   * anything urgent. Never longer than the cap, so a stalled speech engine cannot stop the ring.
   */
  busy(source?: string): boolean {
    const now = Date.now();
    return this.#active.some((a) => (!source || a.source === source || a.priority === 'urgent') && now < a.until);
  }

  /** Polite speech never cuts anyone else off: it waits behind urgent speech or stays quiet. */
  #mayTalk(synth: SpeechSynthesis, source: string, queue: boolean): boolean {
    if (synth.speaking && !this.#active.length) {
      // A voice outside the app (or one already given up on) is talking.
      return false;
    }
    if (this.#active.some((a) => a.source !== source && a.priority === 'polite')) {
      return false;
    }
    return queue || !this.#active.some((a) => a.priority === 'urgent');
  }

  /** The browser reads in order, so a finished sentence means everything before it is done too. */
  #finished(entry: Spoken): void {
    const at = this.#active.indexOf(entry);
    if (at < 0) {
      // Already cut off; the speech that replaced it owns the caption now.
      return;
    }
    this.#active.splice(0, at + 1);
    if (!this.#active.length) {
      this.speaking.set(false);
      this.#hideLater(CAPTION_HOLD_MS);
    }
  }

  /** Forgets sentences long past their cap, which a stalled engine never finished. */
  #prune(): void {
    const now = Date.now();
    this.#active = this.#active.filter((a) => now < a.until + CAPTION_HOLD_MS);
    if (!this.#active.length) {
      this.speaking.set(false);
    }
  }

  #show(text: string, holdMs: number): void {
    this.caption.set(text);
    if (this.settings().show) {
      this.#strip ??= CaptionStrip.forPage();
      this.#strip?.show(text);
    }
    // Hidden after the sentence even if the browser never says it finished.
    this.#hideLater(Math.max(holdMs, CAPTION_HOLD_MS));
  }

  #hideLater(ms: number): void {
    clearTimeout(this.#hideTimer);
    this.#hideTimer = setTimeout(() => {
      this.caption.set('');
      this.#strip?.hide();
    }, ms);
    // Under Node (unit tests) a pending caption must not keep the process alive.
    (this.#hideTimer as { unref?: () => void }).unref?.();
  }
}

/**
 * The app's shared voice. Services and dashboards also run outside Angular in plain unit tests,
 * where there is no injector; they get a voice of their own.
 */
export function speechService(): SpeechService {
  try {
    return inject(SpeechService);
  } catch {
    return new SpeechService();
  }
}

/**
 * The caption strip: one line or two of large text at the bottom of the screen. Hidden from
 * screen readers (aria-hidden), which announce things their own way. Like the switch-control ring
 * it moves into an open modal dialog, which sits above everything else. While it shows, the page
 * gets the `has-captions` class and `--caption-offset`, so the switch-control bar, its keypad,
 * toasts and dialogs move up instead of being covered (captions.scss).
 */
export class CaptionStrip {
  readonly #doc: Document;
  readonly #el: HTMLElement;

  constructor(doc: Document) {
    this.#doc = doc;
    this.#el = doc.createElement('div');
    this.#el.className = 'caption-strip';
    this.#el.setAttribute('aria-hidden', 'true');
    this.#el.setAttribute('data-scan-ignore', '');
    this.#el.hidden = true;
  }

  /** A strip for this page, or null outside a browser. */
  static forPage(): CaptionStrip | null {
    return typeof document === 'undefined' ? null : new CaptionStrip(document);
  }

  get element(): HTMLElement {
    return this.#el;
  }

  show(text: string): void {
    const open = [...this.#doc.querySelectorAll('dialog')].filter((d) => d.open);
    const host = open.at(-1) ?? this.#doc.body;
    if (this.#el.parentElement !== host) {
      host.append(this.#el);
    }
    this.#el.textContent = text;
    this.#el.hidden = false;
    const root = this.#doc.documentElement;
    root.classList.add('has-captions');
    root.style.setProperty('--caption-offset', `${Math.ceil(this.#el.getBoundingClientRect().height) + CAPTION_GAP_PX}px`);
  }

  hide(): void {
    this.#el.hidden = true;
    this.#el.textContent = '';
    const root = this.#doc.documentElement;
    root.classList.remove('has-captions');
    root.style.removeProperty('--caption-offset');
  }
}
