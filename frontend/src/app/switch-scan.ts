import { Injectable, signal } from '@angular/core';
import { accessibilityStore } from './accessibility';
import { speakable } from './speech-text';

/**
 * Switch control: lets someone who can press only one button (a head switch, a sip-and-puff
 * device, a large accessibility button or the space bar) use the whole dashboard.
 *
 * A ring moves through the page on a timer. Pressing the switch picks what the ring is on:
 * a group (marked with data-scan-group) opens so its controls are scanned next, a button is
 * clicked, and a number, text or dropdown field opens an on-screen pad that is scanned the same
 * way. Every level ends with "Back" (or "Pause scanning" at the top), so nobody gets stuck.
 */

export interface ScanSettings {
  enabled: boolean;
  /** How long the ring stays on each item. */
  intervalMs: number;
  /** Which key acts as the switch. Most USB accessibility switches send Space or Enter. */
  key: ScanKey;
  /** Read each item aloud as the ring reaches it, for people who cannot see the ring (auditory scanning). */
  speak: boolean;
  /** Inside a group, offer "Go back?" this often, wherever the ring is (0 = never). */
  backEverySec: number;
  /** Offer "Pause switch control?" this often (0 = never). */
  pauseEverySec: number;
}
export type ScanKey = 'Space' | 'Enter';
export type ScanPrompt = 'back' | 'pause';

export const SCAN_SPEEDS = [
  { value: 700, label: 'Fast (0.7 s)' },
  { value: 1200, label: 'Normal (1.2 s)' },
  { value: 2000, label: 'Slow (2 s)' },
  { value: 3000, label: 'Slowest (3 s)' },
];
export const SCAN_KEYS: { value: ScanKey; label: string }[] = [
  { value: 'Space', label: 'Space bar' },
  { value: 'Enter', label: 'Enter' },
];
export const SCAN_BACK_PROMPTS = [
  { value: 0, label: 'Never' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every minute' },
];
export const SCAN_PAUSE_PROMPTS = [
  { value: 0, label: 'Never' },
  { value: 120, label: 'Every 2 minutes' },
  { value: 300, label: 'Every 5 minutes' },
];
const DEFAULT_SCAN: ScanSettings = {
  enabled: false, intervalMs: 1200, key: 'Space', speak: false, backEverySec: 30, pauseEverySec: 120,
};
/** Unanswered passes through a group before scanning steps back out of it. */
const CYCLES_BEFORE_BACK = 2;
/** Spoken items are read a little faster than the briefing, since they are short. */
const SPEECH_RATE = 1.1;
/**
 * The longest the ring waits for a sentence. It normally moves on when the browser says the
 * sentence has finished; this cap only matters if the speech engine stalls. Generous on purpose:
 * Chrome can take a few seconds to start, and reads amounts like "$24,550.68" slowly.
 */
export function speechTime(text: string): number {
  return Math.min(MIN_SPEECH_MS + (text.length * MS_PER_CHARACTER) / SPEECH_RATE, MAX_SPEECH_MS);
}
const MIN_SPEECH_MS = 4000;
const MS_PER_CHARACTER = 150;
const MAX_SPEECH_MS = 30000;

/** Saved settings, or the defaults when nothing valid is stored. */
export function parseScanSettings(saved: unknown): ScanSettings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<ScanSettings>;
  return {
    enabled: s.enabled === true,
    intervalMs: SCAN_SPEEDS.some((speed) => speed.value === s.intervalMs) ? s.intervalMs! : DEFAULT_SCAN.intervalMs,
    key: SCAN_KEYS.some((k) => k.value === s.key) ? s.key! : DEFAULT_SCAN.key,
    speak: s.speak === true,
    backEverySec: SCAN_BACK_PROMPTS.some((p) => p.value === s.backEverySec) ? s.backEverySec! : DEFAULT_SCAN.backEverySec,
    pauseEverySec: SCAN_PAUSE_PROMPTS.some((p) => p.value === s.pauseEverySec) ? s.pauseEverySec! : DEFAULT_SCAN.pauseEverySec,
  };
}

/** Alt+S turns switch control on or off from anywhere, so someone who cannot see Settings can start it. */
export function isSwitchControlShortcut(event: KeyboardEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && event.key?.toLowerCase() === 's';
}

/**
 * The element the ring is drawn around. A settings toggle sits far from its label, so on its own
 * it looks like a dot in empty space; the ring takes in the row it labels instead.
 */
export function ringTarget(el: HTMLElement): HTMLElement {
  const field = el as HTMLInputElement;
  if (el.tagName === 'INPUT' && (field.type === 'checkbox' || field.type === 'radio') && field.labels?.length) {
    const label = field.labels[0];
    return label.contains(el) ? label : el;
  }
  if (el.getAttribute('role') !== 'switch' || !el.parentElement) {
    return el;
  }
  const row = el.parentElement;
  const controlText = [...row.querySelectorAll(FOCUSABLE)].reduce((n, c) => n + (c.textContent ?? '').trim().length, 0);
  const ownText = (row.textContent ?? '').trim().length > controlText;
  const box = el.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  return ownText && rowBox.height <= Math.max(box.height * 4, 96) ? row : el;
}

/** True when a key event is the configured switch. */
export function isSwitchKey(event: KeyboardEvent, key: ScanKey): boolean {
  return key === 'Space' ? event.code === 'Space' || event.key === ' ' : event.key === 'Enter';
}

export type ScanItem =
  | { kind: 'control'; el: HTMLElement }
  | { kind: 'group'; el: HTMLElement }
  | { kind: 'back' }
  | { kind: 'pause' };

export interface ScanEngineOptions {
  intervalMs?: number;
  key?: ScanKey;
  /** Read each item aloud as the ring reaches it. */
  speak?: boolean;
  /** How often to offer "Go back?" inside a group, and "Pause switch control?", in ms (0 = never). */
  backEveryMs?: number;
  pauseEveryMs?: number;
  /** Whether an element is on screen. Tests replace it; browsers use layout. */
  isVisible?: (el: HTMLElement) => boolean;
  /** Called by the "Turn off" button on the status bar. */
  onTurnOff?: () => void;
  /** Off in tests, which call next() themselves. */
  autoAdvance?: boolean;
}

const FOCUSABLE =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
const CLICKED_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'color', 'range', 'file']);
const NUMBER_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '⌫']];
const LETTER_ROWS = [
  ['A', 'B', 'C', 'D', 'E', 'F'],
  ['G', 'H', 'I', 'J', 'K', 'L'],
  ['M', 'N', 'O', 'P', 'Q', 'R'],
  ['S', 'T', 'U', 'V', 'W', 'X'],
  ['Y', 'Z', 'Space', '⌫'],
];

/** Component hosts styled `display: contents` draw no box of their own; their children do. */
function isContents(el: Element): boolean {
  return el.ownerDocument.defaultView?.getComputedStyle(el).display === 'contents';
}

function defaultVisible(el: HTMLElement): boolean {
  if (isContents(el)) {
    return [...el.children].some((child) => defaultVisible(child as HTMLElement));
  }
  const check = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  if (check) {
    return check.call(el, { visibilityProperty: true });
  }
  return el.getClientRects().length > 0;
}

/** Where an element is on screen; for a `display: contents` host, the box around its children. */
export function screenBox(el: Element): { left: number; top: number; width: number; height: number } {
  if (!isContents(el)) {
    const { left, top, width, height } = el.getBoundingClientRect();
    return { left, top, width, height };
  }
  const boxes = [...el.children].map(screenBox).filter((b) => b.width || b.height);
  if (!boxes.length) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * The name a person would use for an element: its label, aria-label, group name or text. Short
 * names (`max`) suit announcements like "Buy selected."; the ring reads the whole thing.
 */
export function scanLabel(el: HTMLElement, max = 80): string {
  const aria = el.getAttribute('aria-label') ?? el.getAttribute('data-scan-group');
  if (aria) {
    return aria;
  }
  const labelled = el.getAttribute('aria-labelledby');
  const byId = labelled ? el.ownerDocument.getElementById(labelled)?.textContent : '';
  const fieldLabel = (el as HTMLInputElement).labels?.[0]?.textContent;
  const named = [byId, fieldLabel, shownText(el), (el as HTMLInputElement).placeholder, el.getAttribute('title')];
  const text = named.find(Boolean) ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, max) || 'Control';
}

/**
 * Text as it is laid out: lines shown one under the other ("All in one company" above "Every
 * invested dollar …") are read as sentences, not glued together as "companyEvery".
 */
function shownText(el: HTMLElement): string {
  const lines = (el.innerText || el.textContent || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.map((line, i) => (i < lines.length - 1 && !/[.!?:,]$/.test(line) ? `${line}.` : line)).join(' ');
}

/**
 * What the ring says on a control: its whole name, plus its state or value when it has one. An
 * element can carry words meant for speech in data-speak ("1 month" on a button showing "1M"),
 * kept apart from its accessible name, which must match what is on screen (WCAG 2.5.3).
 */
export function spokenItem(el: HTMLElement): string {
  const label = el.getAttribute('data-speak') || scanLabel(el, Number.POSITIVE_INFINITY);
  const field = el as HTMLInputElement;
  if (el.tagName === 'INPUT' && field.type === 'checkbox') {
    return `${label}, ${field.checked ? 'on' : 'off'}`;
  }
  if (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-current') === 'page') {
    return `${label}, selected`;
  }
  if ((el.tagName === 'INPUT' || el.tagName === 'SELECT') && field.value && field.value !== label) {
    return `${label}, ${field.value}`;
  }
  return label;
}

/**
 * The scanning itself, independent of Angular so it can be tested with a plain DOM. It draws its
 * own ring, status bar and pads, and puts them inside an open modal dialog when there is one,
 * since a modal dialog sits on the browser's top layer above everything else.
 */
export class ScanEngine {
  intervalMs: number;
  key: ScanKey;
  speak: boolean;
  backEveryMs: number;
  pauseEveryMs: number;
  readonly #doc: Document;
  readonly #isVisible: (el: HTMLElement) => boolean;
  readonly #onTurnOff: () => void;
  readonly #autoAdvance: boolean;
  #stack: HTMLElement[] = [];
  #index = 0;
  #cycles = 0;
  #running = false;
  #paused = false;
  #timer: ReturnType<typeof setInterval> | undefined;
  #resumeAt: HTMLElement | null = null;
  #picker: HTMLElement | null = null;
  #pickerReturn: { stack: HTMLElement[]; field: HTMLElement } | null = null;
  #ring: HTMLElement | null = null;
  #chip: HTMLElement | null = null;
  #live: HTMLElement | null = null;
  #bar: HTMLElement | null = null;
  /** The ring's own sentence being read, so the ring knows when it is talking and never cuts off the briefing. */
  #utterance: SpeechSynthesisUtterance | null = null;
  /** When what the ring is saying should be finished; it waits until then before moving on. */
  #speechUntil = 0;
  /** The item last read out, so a redraw does not read it again. */
  #spokenKey: unknown = null;
  /** An announcement was just read; the next item waits for it instead of cutting it off. */
  #queueNext = false;
  /** A "Go back?" or "Pause?" offer showing instead of the current item, for one step. */
  #prompt: ScanPrompt | null = null;
  #lastBackPrompt = 0;
  #lastPausePrompt = 0;
  /** What the ring is drawn around, followed every frame so it stays on moving or redrawn items. */
  #tracked: HTMLElement | null = null;
  #frame: number | undefined;

  constructor(doc: Document, options: ScanEngineOptions = {}) {
    this.#doc = doc;
    this.intervalMs = options.intervalMs ?? DEFAULT_SCAN.intervalMs;
    this.key = options.key ?? DEFAULT_SCAN.key;
    this.speak = options.speak ?? DEFAULT_SCAN.speak;
    this.backEveryMs = options.backEveryMs ?? DEFAULT_SCAN.backEverySec * 1000;
    this.pauseEveryMs = options.pauseEveryMs ?? DEFAULT_SCAN.pauseEverySec * 1000;
    this.#isVisible = options.isVisible ?? defaultVisible;
    this.#onTurnOff = options.onTurnOff ?? (() => this.stop());
    this.#autoAdvance = options.autoAdvance ?? true;
  }

  get running(): boolean {
    return this.#running;
  }
  get paused(): boolean {
    return this.#paused;
  }
  get pickerOpen(): boolean {
    return !!this.#picker;
  }
  /** The offer showing instead of the current item, if any. */
  get prompt(): ScanPrompt | null {
    return this.#prompt;
  }
  /** How many levels deep scanning is; 1 is the page (or the open dialog) itself. */
  get depth(): number {
    return this.#stack.length;
  }

  start(): void {
    if (this.#running) {
      return;
    }
    this.#running = true;
    this.#paused = false;
    this.#buildUi();
    this.#doc.addEventListener('keydown', this.#onKeyDown, true);
    this.#doc.addEventListener('keyup', this.#onKeyUp, true);
    this.#doc.addEventListener('visibilitychange', this.#onVisibility);
    this.#doc.defaultView?.addEventListener('scroll', this.#onScroll, true);
    this.#doc.defaultView?.addEventListener('resize', this.#onScroll);
    this.#stack = [];
    this.#index = 0;
    this.#cycles = 0;
    this.#spokenKey = null;
    this.#prompt = null;
    this.#lastBackPrompt = this.#lastPausePrompt = Date.now();
    this.#announce(`Switch control on. Press ${this.key === 'Space' ? 'the space bar' : 'Enter'} to choose.`);
    this.#render();
    this.#restartTimer();
    if (this.#autoAdvance) {
      this.#follow();
    }
  }

  stop(): void {
    if (!this.#running) {
      return;
    }
    this.#running = false;
    clearInterval(this.#timer);
    if (this.#frame !== undefined) {
      this.#doc.defaultView?.cancelAnimationFrame(this.#frame);
      this.#frame = undefined;
    }
    this.#tracked = null;
    if (this.#utterance) {
      globalThis.speechSynthesis?.cancel();
      this.#utterance = null;
    }
    this.#doc.removeEventListener('keydown', this.#onKeyDown, true);
    this.#doc.removeEventListener('keyup', this.#onKeyUp, true);
    this.#doc.removeEventListener('visibilitychange', this.#onVisibility);
    this.#doc.defaultView?.removeEventListener('scroll', this.#onScroll, true);
    this.#doc.defaultView?.removeEventListener('resize', this.#onScroll);
    this.#picker?.remove();
    this.#picker = null;
    this.#pickerReturn = null;
    for (const el of [this.#ring, this.#chip, this.#live, this.#bar]) {
      el?.remove();
    }
    this.#ring = this.#chip = this.#live = this.#bar = null;
  }

  /** Restarts the timer, e.g. after the speed changes. */
  restart(): void {
    if (this.#running) {
      this.#restartTimer();
    }
  }

  /** The items at the current level, in scanning order. */
  items(): ScanItem[] {
    const container = this.#container();
    const list = this.#collect(container);
    if (this.#stack.length > 1) {
      list.push({ kind: 'back' });
    } else if (!this.#picker) {
      list.push({ kind: 'pause' });
    } else {
      // A keypad at its top level adds neither Back nor Pause.
    }
    return list;
  }

  /** The item the ring is on. */
  current(): ScanItem | null {
    const items = this.items();
    if (this.#resumeAt) {
      // After a re-render the element itself is gone; its replacement has the same name.
      const resume = this.#resumeAt;
      const label = resume.isConnected ? null : scanLabel(resume);
      const at = items.findIndex(
        (item) => 'el' in item && (label ? scanLabel(item.el) === label : item.el === resume || item.el.contains(resume)),
      );
      this.#resumeAt = null;
      this.#index = Math.max(0, at);
    }
    if (!items.length) {
      return null;
    }
    this.#index = Math.min(this.#index, items.length - 1);
    return items[this.#index];
  }

  /**
   * Moves the ring to the next item; after a few unanswered passes, leaves the group. When an offer
   * is due ("Go back?", "Pause?") it shows for one step instead; left unanswered, the ring carries
   * on with the next item (not the one before the offer, which was already read out).
   */
  next(now = Date.now()): void {
    if (!this.#running || this.#paused) {
      return;
    }
    const offered = this.#prompt;
    this.#prompt = null;
    const due = offered ? null : this.#duePrompt(now);
    if (due) {
      this.#prompt = due;
      if (due === 'back') {
        this.#lastBackPrompt = now;
      } else {
        this.#lastPausePrompt = now;
      }
      this.#announce('', false);
      this.#render();
      return;
    }
    const count = this.items().length;
    if (!count) {
      return;
    }
    this.#index += 1;
    if (this.#index >= count) {
      this.#index = 0;
      this.#cycles += 1;
      if (this.#stack.length > 1 && this.#cycles >= CYCLES_BEFORE_BACK) {
        this.#pop();
      }
    }
    // A control is announced by taking focus; groups and Back/Pause announce themselves.
    this.#announce('');
    this.#render();
  }

  /** The switch was pressed: act on the highlighted item. */
  press(): void {
    if (!this.#running) {
      return;
    }
    if (this.#paused) {
      this.#paused = false;
      this.#index = 0;
      this.#cycles = 0;
      this.#spokenKey = null;
      this.#announce('Scanning again.');
      this.#render();
      this.#restartTimer();
      return;
    }
    const offer = this.#prompt;
    this.#prompt = null;
    const item: ScanItem | null = offer ? { kind: offer } : this.current();
    if (!item) {
      return;
    }
    this.#cycles = 0;
    if (item.kind === 'back') {
      this.#pop();
      this.#spokenKey = null;
    } else if (item.kind === 'pause') {
      this.#paused = true;
      // "Resume" is read like the noun résumé, so it is never used.
      this.#announce(`Paused. Press ${this.key === 'Space' ? 'space' : 'Enter'} to continue.`);
    } else if (item.kind === 'group') {
      this.#stack.push(item.el);
      this.#index = 0;
      this.#lastBackPrompt = Date.now();
      this.#announce(`${scanLabel(item.el)}, ${this.#collect(item.el).length} items.`);
    } else {
      this.#activate(item.el);
    }
    this.#render();
    this.#restartTimer();
    // The page re-renders after a click; draw the ring again once it has.
    setTimeout(() => this.#render(), 60);
  }

  // ----- levels -----

  /** The open pad, else the open modal dialog, else the page. */
  #scope(): HTMLElement {
    if (this.#picker) {
      return this.#picker;
    }
    return this.#openDialog() ?? this.#doc.body;
  }

  #openDialog(): HTMLElement | null {
    const open = [...this.#doc.querySelectorAll<HTMLDialogElement>('dialog')].filter((d) => d.open && !d.closest('[data-scan-ignore]'));
    return open.at(-1) ?? null;
  }

  /** The group being scanned, resetting to the scope when a dialog or pad opened or closed. */
  #container(): HTMLElement {
    const scope = this.#scope();
    if (this.#stack[0] !== scope) {
      this.#stack = [scope];
      this.#index = 0;
      this.#cycles = 0;
    }
    if (this.#stack.some((el) => !el.isConnected)) {
      this.#reattach();
    }
    while (this.#stack.length > 1 && !this.#usable(this.#stack.at(-1)!)) {
      this.#stack.pop();
      this.#index = 0;
    }
    return this.#stack.at(-1)!;
  }

  /**
   * The page re-rendered (a route change replaces the whole dashboard), so the groups being
   * scanned are gone. Finds the new groups with the same names, so the user stays where they were.
   */
  #reattach(): void {
    const names = this.#stack.slice(1).map((el) => el.getAttribute('data-scan-group'));
    const stack = [this.#stack[0]];
    for (const name of names) {
      const match = this.#collect(stack.at(-1)!).find((item) => item.kind === 'group' && item.el.getAttribute('data-scan-group') === name);
      if (!match || !('el' in match)) {
        break;
      }
      stack.push(match.el);
    }
    this.#stack = stack;
  }

  #pop(): void {
    if (this.#stack.length <= 1) {
      return;
    }
    const left = this.#stack.pop()!;
    this.#cycles = 0;
    this.#index = Math.max(0, this.items().findIndex((item) => 'el' in item && item.el === left));
  }

  /** Groups and controls that belong directly to a container (not to a group inside it). */
  #collect(container: HTMLElement): ScanItem[] {
    const out: ScanItem[] = [];
    for (const el of container.querySelectorAll<HTMLElement>(`[data-scan-group], ${FOCUSABLE}`)) {
      if (this.#owner(el, container) !== container || !this.#usable(el)) {
        continue;
      }
      if (!el.hasAttribute('data-scan-group')) {
        out.push({ kind: 'control', el });
        continue;
      }
      const inner = this.#collect(el);
      if (inner.length === 1) {
        out.push(inner[0]);
      } else if (inner.length > 1) {
        out.push({ kind: 'group', el });
      } else {
        // A group with nothing scannable inside is skipped.
      }
    }
    return out;
  }

  #owner(el: HTMLElement, container: HTMLElement): HTMLElement {
    for (let parent = el.parentElement; parent && parent !== container; parent = parent.parentElement) {
      if (parent.hasAttribute('data-scan-group') || parent.tagName === 'DIALOG') {
        return parent;
      }
    }
    return container;
  }

  #usable(el: HTMLElement): boolean {
    if (!el.isConnected || el.closest('[data-scan-ignore], [inert], [aria-hidden="true"]')) {
      return false;
    }
    if ((el as HTMLButtonElement).disabled) {
      return false;
    }
    const dialog = el.closest('dialog');
    if (dialog && !dialog.open) {
      return false;
    }
    return this.#isVisible(el);
  }

  // ----- acting on a control -----

  #activate(el: HTMLElement): void {
    const tag = el.tagName;
    const type = (el as HTMLInputElement).type?.toLowerCase();
    if (tag === 'SELECT') {
      this.#openSelectPad(el as HTMLSelectElement);
    } else if ((tag === 'INPUT' && !CLICKED_INPUTS.has(type)) || tag === 'TEXTAREA') {
      this.#openTypingPad(el as HTMLInputElement, type === 'number' ? NUMBER_ROWS : LETTER_ROWS);
    } else {
      this.#resumeAt = el;
      el.click();
      this.#announce(`${scanLabel(el)} selected.`);
    }
  }

  /** A scanned keypad for a number or text field. Each key updates the field at once. */
  #openTypingPad(field: HTMLInputElement, rows: string[][]): void {
    const original = field.value;
    let value = original;
    // Like a selected field: the first key replaces what was there instead of adding to it.
    let fresh = original !== '';
    const numeric = field.type === 'number';
    const pad = this.#makePad(scanLabel(field));
    const display = pad.querySelector('output')!;
    display.textContent = value || ' ';
    const write = (next: string) => {
      value = next;
      display.textContent = value || ' ';
      // A number field drops a value like "1." it cannot parse, so wait for the next digit.
      if (!numeric || !value.endsWith('.')) {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    for (const keys of rows) {
      const row = this.#padRow(pad, `${keys[0]} to ${keys.at(-1)}`);
      for (const key of keys) {
        const name = key === '⌫' ? 'Delete' : key;
        this.#padButton(row, key, name, () => {
          if (fresh && key !== '⌫') {
            value = '';
          }
          fresh = false;
          if (key === '⌫') {
            write(value.slice(0, -1));
          } else if (key === '.' && value.includes('.')) {
            return;
          } else {
            write(value + (key === 'Space' ? ' ' : numeric ? key : key.toLowerCase()));
          }
          this.#announce(value ? `${value.split('').join(' ')}` : 'Empty');
        });
      }
    }
    const finish = this.#padRow(pad, 'Done or cancel');
    this.#padButton(finish, 'Done', 'Done', () => {
      field.value = value.replace(/\.$/, '');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      this.#closePad();
    });
    this.#padButton(finish, 'Cancel', 'Cancel', () => {
      field.value = original;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      this.#closePad();
    });
    this.#openPad(pad, field);
  }

  /** A scanned list of a dropdown's options, five to a row. */
  #openSelectPad(select: HTMLSelectElement): void {
    const pad = this.#makePad(scanLabel(select));
    pad.querySelector('output')!.textContent = select.selectedOptions[0]?.textContent?.trim() ?? '';
    const options = [...select.options].filter((o) => !o.disabled);
    for (let i = 0; i < options.length; i += 5) {
      const chunk = options.slice(i, i + 5);
      // An option can carry a spoken name ("Apple") alongside what it shows ("AAPL · Apple Inc.").
      const text = (o: HTMLOptionElement) => o.getAttribute('data-speak') || o.textContent?.trim() || o.value;
      const row = this.#padRow(pad, chunk.length > 1 ? `${text(chunk[0])} to ${text(chunk.at(-1)!)}` : text(chunk[0]));
      for (const option of chunk) {
        this.#padButton(row, text(option), text(option), () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          this.#closePad();
          this.#announce(`${text(option)} chosen.`);
        });
      }
    }
    this.#padButton(this.#padRow(pad, 'Cancel'), 'Cancel', 'Cancel', () => this.#closePad());
    this.#openPad(pad, select);
  }

  #makePad(title: string): HTMLElement {
    const pad = this.#doc.createElement('div');
    pad.className = 'scan-pad';
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', `Enter ${title}`);
    const heading = this.#doc.createElement('div');
    heading.className = 'scan-pad-title';
    heading.textContent = title;
    const output = this.#doc.createElement('output');
    output.className = 'scan-pad-value';
    pad.append(heading, output);
    return pad;
  }

  #padRow(pad: HTMLElement, label: string): HTMLElement {
    const row = this.#doc.createElement('div');
    row.className = 'scan-pad-row';
    row.setAttribute('data-scan-group', label);
    pad.append(row);
    return row;
  }

  #padButton(row: HTMLElement, text: string, label: string, act: () => void): void {
    const button = this.#doc.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', act);
    row.append(button);
  }

  #openPad(pad: HTMLElement, field: HTMLElement): void {
    this.#pickerReturn = { stack: [...this.#stack], field };
    (this.#openDialog() ?? this.#doc.body).append(pad);
    this.#picker = pad;
    this.#stack = [];
    this.#index = 0;
    this.#announce(`${scanLabel(field)} keypad.`);
  }

  #closePad(): void {
    const back = this.#pickerReturn;
    this.#picker?.remove();
    this.#picker = null;
    this.#pickerReturn = null;
    if (back) {
      this.#stack = back.stack;
      this.#resumeAt = back.field;
      back.field.focus({ preventScroll: true });
    }
  }

  // ----- drawing -----

  #buildUi(): void {
    const make = (className: string) => {
      const el = this.#doc.createElement('div');
      el.className = className;
      el.setAttribute('data-scan-ignore', '');
      return el;
    };
    this.#ring = make('scan-ring');
    this.#ring.setAttribute('aria-hidden', 'true');
    this.#chip = make('scan-chip');
    this.#chip.setAttribute('aria-hidden', 'true');
    this.#live = make('scan-live');
    this.#live.setAttribute('aria-live', 'polite');
    this.#bar = make('scan-bar');
    this.#bar.setAttribute('role', 'region');
    this.#bar.setAttribute('aria-label', 'Switch control');
    const text = this.#doc.createElement('span');
    text.textContent = `Switch control on · ${this.key === 'Space' ? 'Space bar' : 'Enter'} selects`;
    const off = this.#doc.createElement('button');
    off.type = 'button';
    off.textContent = 'Turn off';
    off.addEventListener('click', () => this.#onTurnOff());
    this.#bar.append(text, off);
    this.#doc.body.append(this.#bar);
  }

  /** Which offer is due now, if any. "Go back?" only makes sense inside a group. */
  #duePrompt(now: number): ScanPrompt | null {
    if (this.#picker) {
      return null;
    }
    if (this.pauseEveryMs > 0 && now - this.#lastPausePrompt >= this.pauseEveryMs) {
      return 'pause';
    }
    if (this.backEveryMs > 0 && this.#stack.length > 1 && now - this.#lastBackPrompt >= this.backEveryMs) {
      return 'back';
    }
    return null;
  }

  /** Puts the ring on the current item and focuses it, so screen readers follow along too. */
  #render(): void {
    if (!this.#running || !this.#ring || !this.#chip || !this.#live) {
      return;
    }
    const host = this.#openDialog() ?? this.#doc.body;
    for (const el of [this.#ring, this.#chip, this.#live]) {
      if (el.parentElement !== host) {
        host.append(el);
      }
    }
    const item = this.#paused ? null : this.current();
    const chipShown = !!this.#prompt || item?.kind === 'back' || item?.kind === 'pause';
    this.#ring.hidden = !item;
    this.#chip.hidden = !item || !chipShown;
    this.#ring.classList.toggle('group', !chipShown && item?.kind === 'group');
    if (!item) {
      return;
    }
    if (this.#prompt) {
      this.#renderPrompt(this.#prompt);
    } else if (item.kind === 'back' || item.kind === 'pause') {
      this.#renderChip(item.kind);
    } else {
      this.#renderElement(item);
    }
    this.#position();
  }

  /** "Go back? Press space now." or "Pause switch control? Press space now.", on the chip. */
  #renderPrompt(prompt: ScanPrompt): void {
    const key = this.key === 'Space' ? 'space' : 'Enter';
    const question = prompt === 'back' ? 'Go back?' : 'Pause switch control?';
    this.#chip!.textContent = `${prompt === 'back' ? '◀' : '⏸'} ${question} Press ${key} now`;
    this.#placeChip(prompt === 'back' ? this.#stack.at(-1)! : null);
    this.#announce(`${question} Press ${key} now.`, false);
    this.#sayItem(`prompt:${prompt}:${prompt === 'back' ? this.#lastBackPrompt : this.#lastPausePrompt}`, `${question} Press ${key} now.`);
  }

  #renderChip(kind: 'back' | 'pause'): void {
    const name = kind === 'back' ? 'Back' : 'Pause scanning';
    this.#chip!.textContent = kind === 'back' ? '◀ Back' : '⏸ Pause scanning';
    this.#placeChip(kind === 'back' ? this.#stack.at(-1)! : null);
    this.#announce(name, false);
    this.#sayItem(`${kind}:${this.#stack.length}`, name);
  }

  #renderElement(item: { kind: 'control' | 'group'; el: HTMLElement }): void {
    if (item.kind === 'control') {
      item.el.focus({ preventScroll: true });
      this.#sayItem(this.#itemKey(), spokenItem(item.el));
    } else {
      this.#announce(`${scanLabel(item.el)} group`, false);
      this.#sayItem(this.#itemKey(), `${scanLabel(item.el)} group`);
    }
    const scrollTarget = isContents(item.el) ? (item.el.firstElementChild as HTMLElement | null) : item.el;
    scrollTarget?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * Where the ring is: its level and position there. Prices redraw their buttons on every update,
   * so keying by position (not by element) keeps a redraw from reading the same item again.
   */
  #itemKey(): string {
    const top = this.#stack.at(-1);
    const level = top?.getAttribute('data-scan-group') ?? top?.getAttribute('aria-label') ?? top?.tagName ?? '';
    return `${this.#stack.length}:${level}:${this.#index}`;
  }

  #placeChip(group: HTMLElement | null): void {
    const chip = this.#chip!;
    if (!group) {
      chip.style.left = '16px';
      chip.style.top = '';
      chip.style.bottom = '64px';
      return;
    }
    const box = screenBox(group);
    const view = this.#doc.defaultView;
    chip.style.bottom = '';
    chip.style.left = `${Math.max(8, box.left)}px`;
    chip.style.top = `${Math.min(Math.max(8, box.top - 40), (view?.innerHeight ?? 800) - 48)}px`;
  }

  #position(): void {
    const item = this.#paused ? null : this.current();
    if (!item || !this.#ring) {
      this.#tracked = null;
      return;
    }
    this.#tracked = this.#prompt || !('el' in item) ? this.#chip! : ringTarget(item.el);
    this.#drawRing(this.#tracked);
  }

  #drawRing(target: HTMLElement): void {
    const box = screenBox(target);
    Object.assign(this.#ring!.style, {
      left: `${box.left - 4}px`,
      top: `${box.top - 4}px`,
      width: `${box.width + 8}px`,
      height: `${box.height + 8}px`,
    });
  }

  /**
   * Keeps the ring on its item every frame: the price tape scrolls, panels grow as data loads, and
   * live prices redraw their buttons. A redrawn item is found again by its position, and gets focus
   * back so screen readers and the tape's pause-on-focus keep working.
   */
  readonly #follow = (): void => {
    this.#frame = undefined;
    if (!this.#running) {
      return;
    }
    if (!this.#paused && this.#ring && !this.#ring.hidden) {
      const tracked = this.#tracked;
      if (tracked) {
        if (tracked.isConnected) {
          this.#drawRing(tracked);
        } else {
          this.#position();
        }
      }
      this.#refocus();
    }
    this.#frame = this.#doc.defaultView?.requestAnimationFrame(this.#follow);
  };

  /** A redraw removed the focused item; focus its replacement. Only looks when focus was lost. */
  #refocus(): void {
    const active = this.#doc.activeElement;
    if (this.#prompt || (active && active !== this.#doc.body)) {
      return;
    }
    const item = this.current();
    if (item?.kind === 'control') {
      item.el.focus({ preventScroll: true });
    }
  }

  /**
   * Says something for the page: a chart summary waits for what the ring is saying; an order
   * read-back (`interrupt`) cuts in, since it is what the user must hear before confirming.
   */
  say(text: string, interrupt = false): void {
    if (this.#live) {
      this.#live.textContent = text;
    }
    this.#say(text, !interrupt);
  }

  /** Tells screen readers what happened and, when speaking is on, says it aloud too. */
  #announce(text: string, speak = true): void {
    if (this.#live) {
      this.#live.textContent = text;
    }
    if (speak) {
      if (text) {
        this.#say(text, false);
      }
      this.#queueNext = Boolean(text);
    }
  }

  /** Reads the item the ring landed on, once, waiting for an announcement just made. */
  #sayItem(key: unknown, text: string): void {
    if (key === this.#spokenKey) {
      return;
    }
    this.#spokenKey = key;
    this.#say(text, this.#queueNext);
    this.#queueNext = false;
  }

  #say(raw: string, queue: boolean): void {
    const synth = globalThis.speechSynthesis;
    // Keypad keys are single letters and digits, said as they are; everything else is cleaned up.
    const text = this.#picker ? raw : speakable(raw);
    if (!this.speak || !text || !synth || typeof globalThis.SpeechSynthesisUtterance !== 'function') {
      return;
    }
    // Another voice, such as the market briefing, is talking; the ring stays quiet rather than cut it off.
    if (synth.speaking && !this.#utterance) {
      return;
    }
    if (!queue && this.#utterance) {
      synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = SPEECH_RATE;
    const done = () => {
      if (this.#utterance === utterance) {
        this.#utterance = null;
      }
    };
    utterance.onend = done;
    utterance.onerror = done;
    this.#utterance = utterance;
    // A queued sentence starts after the one being read, so the ring waits for both.
    const from = queue ? Math.max(Date.now(), this.#speechUntil) : Date.now();
    this.#speechUntil = from + speechTime(text);
    synth.speak(utterance);
  }

  /** The ring is still reading something out (until the browser says it finished), so it waits. */
  #talking(): boolean {
    return !!this.#utterance && Date.now() < this.#speechUntil;
  }

  #restartTimer(): void {
    clearInterval(this.#timer);
    if (this.#autoAdvance && this.#running) {
      this.#timer = setInterval(() => {
        if (!this.#talking()) {
          this.next();
        }
      }, this.intervalMs);
    }
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!isSwitchKey(event, this.key)) {
      return;
    }
    // The switch never types or clicks on its own; scanning decides what it does. The event still
    // propagates so the session's inactivity timer counts each press as activity.
    event.preventDefault();
    if (!event.repeat) {
      this.press();
    }
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    // Browsers click a focused button when Space is released; scanning already acted on the press.
    if (isSwitchKey(event, this.key)) {
      event.preventDefault();
    }
  };

  readonly #onVisibility = (): void => {
    if (this.#doc.hidden) {
      clearInterval(this.#timer);
    } else {
      this.#restartTimer();
    }
  };

  readonly #onScroll = (): void => this.#position();
}

/**
 * App-wide switch control: keeps the settings in the Accessibility settings store (PS-17) and runs
 * one ScanEngine while it is on. Created at startup, so scanning resumes straight after a reload.
 */
@Injectable({ providedIn: 'root' })
export class SwitchScanService {
  readonly #store = accessibilityStore();
  readonly settings = signal<ScanSettings>(this.#store.read('switchControl', parseScanSettings));
  #engine: ScanEngine | null = null;

  constructor() {
    if (this.settings().enabled) {
      this.#start();
    }
  }

  get engine(): ScanEngine | null {
    return this.#engine;
  }

  update(change: Partial<ScanSettings>): void {
    const next = parseScanSettings({ ...this.settings(), ...change });
    this.settings.set(next);
    this.#store.write('switchControl', next);
    if (this.#engine && (!next.enabled || this.#engine.key !== next.key)) {
      // A new key changes the status bar's wording too, so the engine starts over.
      this.#engine.stop();
      this.#engine = null;
    }
    if (next.enabled && !this.#engine) {
      this.#start();
    } else if (this.#engine) {
      this.#engine.intervalMs = next.intervalMs;
      this.#engine.key = next.key;
      this.#engine.speak = next.speak;
      this.#engine.backEveryMs = next.backEverySec * 1000;
      this.#engine.pauseEveryMs = next.pauseEverySec * 1000;
      this.#engine.restart();
    } else {
      // Switch control is off and not running, so there is nothing to update.
    }
  }

  /** Says something for the page (a chart summary, an order read-back) while switch control is on. */
  announce(text: string, interrupt = false): void {
    this.#engine?.say(text, interrupt);
  }

  /**
   * Alt+S turns switch control on or off from any page, sign-in included, so someone who cannot
   * see the Settings page can start it. Turning it on this way also reads items aloud. Returns a
   * function that stops listening.
   */
  listenForShortcut(doc: Document = document): () => void {
    const onKey = (event: KeyboardEvent) => {
      if (!isSwitchControlShortcut(event)) {
        return;
      }
      event.preventDefault();
      if (this.settings().enabled) {
        this.update({ enabled: false });
        speakNow('Switch control off.');
      } else {
        this.update({ enabled: true, speak: true });
      }
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }

  #start(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const { intervalMs, key, speak, backEverySec, pauseEverySec } = this.settings();
    this.#engine = new ScanEngine(document, {
      intervalMs, key, speak, backEveryMs: backEverySec * 1000, pauseEveryMs: pauseEverySec * 1000,
      onTurnOff: () => this.update({ enabled: false }),
    });
    this.#engine.start();
  }
}

/** Speaks one sentence right away, for confirmations given after the ring has stopped. */
function speakNow(text: string): void {
  const synth = globalThis.speechSynthesis;
  if (synth && typeof globalThis.SpeechSynthesisUtterance === 'function') {
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text));
  }
}
