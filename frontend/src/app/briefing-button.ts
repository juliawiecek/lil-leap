import { Component, DestroyRef, Injectable, effect, inject, input, signal } from '@angular/core';
import { BriefingSnapshot, buildBriefing } from './briefing';
import { accessibilityStore } from './accessibility';

/** Voice speed and how often the briefing repeats on its own (0 = only when asked). */
export interface BriefingSettings {
  rate: number;
  everyMinutes: number;
}

export const BRIEFING_RATES = [
  { value: 0.8, label: 'Slow' },
  { value: 1, label: 'Normal' },
  { value: 1.25, label: 'Fast' },
  { value: 1.5, label: 'Faster' },
];
/**
 * Every repeat must fit inside the 10-minute inactivity sign-out, or it can never play: a
 * listener makes no input, so they are signed out first. A repeat does not count as activity
 * (that would keep an unattended session open forever); the "Still there?" warning lets the
 * listener stay. Decision: docs/accessibility/PS-30-inactivity-warning.md.
 */
export const BRIEFING_REPEATS = [
  { value: 0, label: 'Only when I ask' },
  { value: 2, label: 'Every 2 minutes' },
  { value: 5, label: 'Every 5 minutes' },
];
/** The 15, 30 and 60 minute repeats saved before PS-30 become the longest one that can still play. */
const LONGEST_REPEAT = Math.max(...BRIEFING_REPEATS.map((r) => r.value));
const LEGACY_REPEATS = [15, 30, 60];
const DEFAULT_SETTINGS: BriefingSettings = { rate: 1, everyMinutes: 0 };
/** How often the repeat timer checks whether a briefing is due. */
export const BRIEFING_TICK_MS = 30000;

/** Saved settings, or the defaults when nothing valid is stored. */
export function parseBriefingSettings(saved: unknown): BriefingSettings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<BriefingSettings>;
  let everyMinutes = DEFAULT_SETTINGS.everyMinutes;
  if (BRIEFING_REPEATS.some((r) => r.value === s.everyMinutes)) {
    everyMinutes = s.everyMinutes!;
  } else if (LEGACY_REPEATS.includes(s.everyMinutes!)) {
    everyMinutes = LONGEST_REPEAT;
  }
  return {
    rate: BRIEFING_RATES.some((r) => r.value === s.rate) ? s.rate! : DEFAULT_SETTINGS.rate,
    everyMinutes,
  };
}

/** When each account last heard a briefing, by account id; anything that is not a date is dropped. */
export function parseLastBriefings(saved: unknown): Record<string, string> {
  const last = (saved as { lastAt?: unknown } | null)?.lastAt;
  const valid: Record<string, string> = {};
  if (last && typeof last === 'object' && !Array.isArray(last)) {
    for (const [account, at] of Object.entries(last)) {
      if (typeof at === 'string' && Number.isFinite(Date.parse(at))) {
        valid[account] = at;
      }
    }
  }
  return valid;
}

/**
 * Reads briefings aloud with the browser's speech engine, one sentence at a time so long
 * briefings are not cut off and the panel can highlight the sentence being read. Its settings and
 * each account's last-briefing time are kept in the Accessibility settings store (PS-17).
 */
@Injectable({ providedIn: 'root' })
export class BriefingService {
  readonly #store = accessibilityStore();
  readonly settings = signal<BriefingSettings>(this.#store.read('briefing', parseBriefingSettings));
  readonly lines = signal<string[]>([]);
  /** Index of the sentence being read, or -1. */
  readonly current = signal(-1);
  readonly speaking = signal(false);
  #lastBriefings = this.#store.read('briefing', parseLastBriefings);
  /** When the last briefing played (any account), which paces the repeat timer. */
  lastAt: Date | null = latest(Object.values(this.#lastBriefings));

  get supported(): boolean {
    return !!globalThis.speechSynthesis && typeof globalThis.SpeechSynthesisUtterance === 'function';
  }

  update(change: Partial<BriefingSettings>): void {
    this.settings.set(parseBriefingSettings({ ...this.settings(), ...change }));
    this.#save();
  }

  /**
   * When this account last heard a briefing, so the next one reports only what changed since.
   * Null (the last 24 hours) for an account never briefed in this browser.
   */
  lastFor(accountId: string | undefined): Date | null {
    if (!accountId) {
      return this.lastAt;
    }
    const at = this.#lastBriefings[accountId];
    return at ? new Date(at) : null;
  }

  /** Shows the sentences and reads them aloud when the browser can. */
  play(lines: string[], now = new Date(), accountId?: string): void {
    this.stop();
    this.lines.set(lines);
    this.lastAt = now;
    if (accountId) {
      this.#lastBriefings = { ...this.#lastBriefings, [accountId]: now.toISOString() };
      this.#save();
    }
    if (!this.supported) {
      return;
    }
    const synth = globalThis.speechSynthesis;
    this.speaking.set(true);
    lines.forEach((line, index) => {
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.rate = this.settings().rate;
      utterance.onstart = () => this.current.set(index);
      if (index === lines.length - 1) {
        utterance.onend = () => this.#finished();
        utterance.onerror = () => this.#finished();
      }
      synth.speak(utterance);
    });
  }

  stop(): void {
    if (this.supported) {
      globalThis.speechSynthesis.cancel();
    }
    this.#finished();
  }

  #finished(): void {
    this.speaking.set(false);
    this.current.set(-1);
  }

  #save(): void {
    this.#store.write('briefing', { ...this.settings(), lastAt: this.#lastBriefings });
  }
}

function latest(times: string[]): Date | null {
  const newest = Math.max(...times.map((t) => Date.parse(t)));
  return Number.isFinite(newest) ? new Date(newest) : null;
}

/**
 * What a dashboard hands the briefing: everything except "since", which the service tracks per
 * account, plus the account the briefing is about.
 */
export type BriefingSource = () => Promise<Omit<BriefingSnapshot, 'since'> & { accountId?: string }>;

/**
 * Top-bar "Briefing" button (Alt+B). Reads a short spoken summary of the market, the portfolio
 * and recent orders, shows it as text while it plays, and can repeat it on a timer or when the
 * market opens or closes.
 */
@Component({
  selector: 'app-briefing',
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="briefing">
      <button
        type="button"
        class="briefing-button"
        [class.speaking]="service.speaking()"
        [attr.aria-expanded]="open()"
        aria-controls="briefing-panel"
        title="Audio briefing (Alt+B)"
        (click)="open() ? close() : play()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>Briefing</span>
      </button>
      @if (open()) {
        <section id="briefing-panel" class="briefing-panel" aria-label="Audio briefing" data-scan-group="Briefing">
          <div class="panel-top">
            <strong>Market briefing</strong>
            <div class="panel-actions">
              @if (service.speaking()) {
                <button type="button" (click)="service.stop()">Stop</button>
              } @else {
                <button type="button" [disabled]="loading()" (click)="play()">Play again</button>
              }
              <button type="button" aria-label="Close briefing" (click)="close()">×</button>
            </div>
          </div>
          @if (loading()) {
            <p class="note" role="status">Preparing your briefing…</p>
          } @else if (error()) {
            <p class="note" role="alert">{{ error() }}</p>
          } @else {
            @if (!service.supported) {
              <p class="note">This browser cannot read aloud, so the briefing is shown as text.</p>
            }
            <ol>
              @for (line of service.lines(); track $index) {
                <li [class.current]="$index === service.current()">{{ line }}</li>
              }
            </ol>
          }
          <div class="controls">
            <label
              >Voice speed
              <select (change)="service.update({ rate: +$any($event.target).value })">
                @for (r of rates; track r.value) {
                  <option [value]="r.value" [selected]="r.value === service.settings().rate">{{ r.label }}</option>
                }
              </select></label
            >
            <label
              >Repeat
              <select (change)="service.update({ everyMinutes: +$any($event.target).value })">
                @for (r of repeats; track r.value) {
                  <option [value]="r.value" [selected]="r.value === service.settings().everyMinutes">{{ r.label }}</option>
                }
              </select></label
            >
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      :host { position: relative; display: inline-block; }
      .briefing-button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px;
        border: 1px solid var(--surface-tone-02); border-radius: 999px; background: var(--surface-tone-03); color: var(--text);
        font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
      .briefing-button:hover { border-color: var(--surface-tone-01); }
      .briefing-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
      .briefing-button svg { width: 16px; height: 16px; }
      .briefing-button.speaking { border-color: var(--gain); color: var(--gain); }
      .briefing-panel { position: absolute; z-index: 70; top: calc(100% + 8px); right: 0; width: min(380px, calc(100vw - 32px)); padding: 14px;
        border: 1px solid var(--surface-tone-02); border-radius: 10px; background: var(--surface-raised); color: var(--text);
        box-shadow: 0 18px 44px var(--shadow-92); font-size: 13px; }
      .panel-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .panel-actions { display: flex; gap: 6px; }
      .panel-actions button { min-height: 30px; padding: 0 10px; border: 1px solid var(--surface-tone-02); border-radius: 6px;
        background: var(--surface-tone-03); color: inherit; font: inherit; cursor: pointer; }
      .panel-actions button:focus-visible, select:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
      ol { display: grid; gap: 6px; margin: 12px 0; padding: 0; list-style: none; line-height: 1.5; }
      li { padding: 4px 8px; border-left: 3px solid transparent; border-radius: 4px; color: var(--text-muted); }
      li.current { border-left-color: var(--gain); background: var(--gain-wash-07); color: var(--text); }
      .note { margin: 12px 0; color: var(--text-muted); }
      .controls { display: flex; flex-wrap: wrap; gap: 12px; padding-top: 10px; border-top: 1px solid var(--surface-tone-04); }
      label { display: grid; gap: 4px; color: var(--text-muted); font-size: 12px; }
      select { min-height: 30px; padding: 0 8px; border: 1px solid var(--surface-tone-02); border-radius: 6px; background: var(--background);
        color: var(--text); font: inherit; }
    `,
  ],
})
export class BriefingButton {
  readonly service = inject(BriefingService);
  readonly source = input.required<BriefingSource>();
  /** The market's open state; a change triggers a briefing when repeats are on. */
  readonly marketOpen = input<boolean | null>(null);
  readonly open = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rates = BRIEFING_RATES;
  readonly repeats = BRIEFING_REPEATS;
  #lastMarketOpen: boolean | null = null;

  constructor() {
    const timer = setInterval(() => this.tick(), BRIEFING_TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.service.stop();
    });
    effect(() => {
      const open = this.marketOpen();
      const previous = this.#lastMarketOpen;
      this.#lastMarketOpen = open;
      if (previous !== null && open !== null && open !== previous && this.service.settings().everyMinutes > 0) {
        void this.play();
      }
    });
  }

  /** Builds a fresh briefing from the dashboard and reads it. */
  async play(): Promise<void> {
    this.open.set(true);
    this.loading.set(true);
    this.error.set('');
    try {
      const snapshot = await this.source()();
      const since = this.service.lastFor(snapshot.accountId);
      this.service.play(buildBriefing({ ...snapshot, since }), snapshot.now, snapshot.accountId);
    } catch {
      this.service.stop();
      this.error.set('The briefing could not be prepared. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    this.service.stop();
    this.open.set(false);
  }

  /** Plays a briefing when the repeat interval has passed since the last one. */
  tick(now = Date.now()): void {
    const every = this.service.settings().everyMinutes;
    const last = this.service.lastAt;
    const due = every > 0 && !!last && now - last.getTime() >= every * 60000;
    if (due && !this.loading() && !this.service.speaking()) {
      void this.play();
    }
  }

  /** Alt+B plays a briefing from anywhere on the dashboard. */
  onKey(event: KeyboardEvent): void {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      void this.play();
    }
  }
}
