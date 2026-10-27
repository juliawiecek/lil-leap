import { Injectable, signal } from '@angular/core';
import { accessibilityStore } from './accessibility';
import { speechCoordinator, type SpeechEvent } from '../../../shared/speech-coordinator';

/**
 * Captions (PS-23): everything NextTrade says aloud is shown in a strip at the bottom of the
 * screen while it is spoken and for a few seconds after, for anyone who cannot hear it or missed a
 * word. The strip listens to the shared speech coordinator, so switch control, the order
 * read-back, the audio briefing, chart summaries, read-aloud and "What's this?" (Alt+W) are all
 * captioned without each of them knowing about it.
 */

export interface CaptionSettings {
  /** Show what is said in the caption strip. Off until turned on in Settings, like every other accessibility feature. */
  show: boolean;
}

/** Saved caption settings; captions are off unless they were turned on. */
export function parseCaptionSettings(saved: unknown): CaptionSettings {
  return { show: (saved as Partial<CaptionSettings> | null)?.show === true };
}

/** How long a caption stays after its sentence has been spoken. */
export const CAPTION_HOLD_MS = 4000;
/** Space kept between the caption strip and anything moved up above it. */
const CAPTION_GAP_PX = 8;

/**
 * The longest a caption waits for its sentence to finish. Speech normally reports its end; this cap
 * only matters if the speech engine stalls, so a caption never stays on screen for good.
 */
export function captionTime(text: string): number {
  return Math.min(4000 + text.length * 150, 30000);
}

/**
 * The strip itself: large text at the bottom of the screen, hidden from screen readers
 * (aria-hidden), which announce things their own way. Like the switch-control ring it moves into
 * an open modal dialog, which sits above everything else. While it shows, the page gets the
 * `has-captions` class and `--caption-offset`, so the switch-control bar, its keypad, toasts,
 * dialogs and the dashboards' bottom edge move up instead of being covered (captions.scss).
 */
export class CaptionStrip {
  readonly #doc: Document;
  readonly element: HTMLElement;

  constructor(doc: Document) {
    this.#doc = doc;
    this.element = doc.createElement('div');
    this.element.className = 'caption-strip';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('data-scan-ignore', '');
    this.element.hidden = true;
  }

  show(text: string): void {
    const open = [...this.#doc.querySelectorAll('dialog')].filter((d) => d.open);
    const host = open.at(-1) ?? this.#doc.body;
    if (this.element.parentElement !== host) {
      host.append(this.element);
    }
    this.element.textContent = text;
    this.element.hidden = false;
    const root = this.#doc.documentElement;
    root.classList.add('has-captions');
    root.style.setProperty('--caption-offset', `${Math.ceil(this.element.getBoundingClientRect().height) + CAPTION_GAP_PX}px`);
  }

  hide(): void {
    this.element.hidden = true;
    this.element.textContent = '';
    const root = this.#doc.documentElement;
    root.classList.remove('has-captions');
    root.style.removeProperty('--caption-offset');
  }

  remove(): void {
    this.hide();
    this.element.remove();
  }
}

/**
 * What the strip shows and when. Each phrase shows as it starts and stays until it ends plus
 * CAPTION_HOLD_MS; the next phrase replaces it. Independent of Angular so it is tested with a plain
 * DOM and a stand-in coordinator.
 */
export class CaptionBar {
  /** The sentence being spoken, or the last one for a few seconds after; '' when there is none. */
  readonly text = signal('');
  readonly #doc: Document;
  readonly #speech: Pick<typeof speechCoordinator, 'observe'>;
  #strip: CaptionStrip | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stop: (() => void) | undefined;
  #shown = true;

  constructor(doc: Document, speech: Pick<typeof speechCoordinator, 'observe'> = speechCoordinator) {
    this.#doc = doc;
    this.#speech = speech;
  }

  /** Whether the strip is drawn; the text is still tracked while it is off. */
  get shown(): boolean {
    return this.#shown;
  }
  set shown(on: boolean) {
    this.#shown = on;
    if (on && this.text()) {
      this.#draw(this.text());
    } else if (!on) {
      this.#strip?.hide();
    } else {
      // Nothing is being said, so there is nothing to show yet.
    }
  }

  /** Starts captioning everything spoken through the coordinator. */
  start(): void {
    this.#stop ??= this.#speech.observe((event) => this.#heard(event));
  }

  stop(): void {
    this.#stop?.();
    this.#stop = undefined;
    clearTimeout(this.#timer);
    this.text.set('');
    this.#strip?.remove();
    this.#strip = null;
  }

  /**
   * A caption on its own, for a sentence the browser could not speak (no speech engine, or no
   * voice yet): the user still reads what they asked for, even with captions turned off.
   */
  show(text: string): void {
    this.text.set(text);
    this.#draw(text);
    this.#hideIn(captionTime(text) + CAPTION_HOLD_MS);
  }

  #heard(event: SpeechEvent): void {
    if (event.phase === 'start') {
      this.#begin(event.text);
      // Hidden after the cap even if the browser never says the sentence finished.
      this.#hideIn(captionTime(event.text) + CAPTION_HOLD_MS);
    } else if (event.text === this.text()) {
      this.#hideIn(CAPTION_HOLD_MS);
    } else {
      // An older phrase finished after a newer one began; the newer one keeps the strip.
    }
  }

  #begin(text: string): void {
    this.text.set(text);
    if (this.#shown) {
      this.#draw(text);
    }
  }

  #draw(text: string): void {
    this.#strip ??= new CaptionStrip(this.#doc);
    this.#strip.show(text);
  }

  #hideIn(ms: number): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.text.set('');
      this.#strip?.hide();
    }, ms);
    // Under Node (unit tests) a pending caption must not keep the process alive.
    (this.#timer as { unref?: () => void }).unref?.();
  }
}

/** The bar drawing captions on this page, once the app has started it. */
let pageCaptions: CaptionBar | null = null;

/**
 * App-wide captions: keeps the on/off choice in the Accessibility settings store (PS-17) and runs
 * one CaptionBar on the page. Started at app startup, so captions work on every page.
 */
@Injectable({ providedIn: 'root' })
export class CaptionService {
  readonly #store = accessibilityStore();
  readonly settings = signal<CaptionSettings>(this.#store.read('captions', parseCaptionSettings));
  #bar: CaptionBar | null = null;

  /** The page's caption bar, or null before start() or outside a browser. */
  get bar(): CaptionBar | null {
    return this.#bar;
  }

  start(doc: Document | undefined = globalThis.document): void {
    if (this.#bar || !doc) {
      return;
    }
    this.#bar = new CaptionBar(doc);
    this.#bar.shown = this.settings().show;
    this.#bar.start();
    pageCaptions = this.#bar;
  }

  stop(): void {
    this.#bar?.stop();
    if (pageCaptions === this.#bar) {
      pageCaptions = null;
    }
    this.#bar = null;
  }

  /** Turns the caption strip on or off; saved in the Accessibility settings store. */
  setCaptions(show: boolean): void {
    const next = { show };
    this.settings.set(next);
    this.#store.write('captions', next);
    if (this.#bar) {
      this.#bar.shown = show;
    }
  }
}

/**
 * Says a sentence the user is waiting for right now, cutting in on anything else being said: an
 * explanation they asked for (Alt+W) or an order read-back. It is captioned as it plays, and shown
 * as a caption alone when the browser cannot speak it. Returns whether it was spoken.
 */
export function sayNow(owner: string, text: string, rate = 1): boolean {
  if (!text) {
    return false;
  }
  let spoken = false;
  if (speechCoordinator.supported) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    spoken = speechCoordinator.submit(owner, utterance, { interrupt: true, defaultVoice: true });
  }
  if (!spoken) {
    pageCaptions?.show(text);
  }
  return spoken;
}
