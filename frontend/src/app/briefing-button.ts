import { Component, DestroyRef, Injectable, effect, inject, input, signal } from '@angular/core';
import { BriefingSnapshot, buildBriefing } from './briefing';

/** Voice speed and how often the briefing repeats on its own (0 = only when asked). */
export interface BriefingSettings {
  rate: number;
  everyMinutes: number;
}

export const BRIEFING_STORAGE_KEY = 'nexttrade-briefing';
export const BRIEFING_RATES = [
  { value: 0.8, label: 'Slow' },
  { value: 1, label: 'Normal' },
  { value: 1.25, label: 'Fast' },
  { value: 1.5, label: 'Faster' },
];
export const BRIEFING_REPEATS = [
  { value: 0, label: 'Only when I ask' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
];
const DEFAULT_SETTINGS: BriefingSettings = { rate: 1, everyMinutes: 0 };
/** How often the repeat timer checks whether a briefing is due. */
export const BRIEFING_TICK_MS = 30000;

/** Saved settings, or the defaults when nothing valid is stored. */
export function parseBriefingSettings(raw: string | null): BriefingSettings {
  try {
    const saved = JSON.parse(raw ?? '{}') as Partial<BriefingSettings>;
    return {
      rate: BRIEFING_RATES.some((r) => r.value === saved.rate) ? saved.rate! : DEFAULT_SETTINGS.rate,
      everyMinutes: BRIEFING_REPEATS.some((r) => r.value === saved.everyMinutes) ? saved.everyMinutes! : 0,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Reads briefings aloud with the browser's speech engine, one sentence at a time so long
 * briefings are not cut off and the panel can highlight the sentence being read.
 */
@Injectable({ providedIn: 'root' })
export class BriefingService {
  readonly settings = signal<BriefingSettings>(parseBriefingSettings(readStorage()));
  readonly lines = signal<string[]>([]);
  /** Index of the sentence being read, or -1. */
  readonly current = signal(-1);
  readonly speaking = signal(false);
  /** When the last briefing played, so the next one only reports what changed since. */
  lastAt: Date | null = null;

  get supported(): boolean {
    return !!globalThis.speechSynthesis && typeof globalThis.SpeechSynthesisUtterance === 'function';
  }

  update(change: Partial<BriefingSettings>): void {
    const next = parseBriefingSettings(JSON.stringify({ ...this.settings(), ...change }));
    this.settings.set(next);
    try {
      globalThis.localStorage?.setItem(BRIEFING_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be blocked; the setting still applies until the page reloads.
    }
  }

  /** Shows the sentences and reads them aloud when the browser can. */
  play(lines: string[], now = new Date()): void {
    this.stop();
    this.lines.set(lines);
    this.lastAt = now;
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
}

function readStorage(): string | null {
  try {
    return globalThis.localStorage?.getItem(BRIEFING_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** What a dashboard hands the briefing: everything except "since", which the service tracks. */
export type BriefingSource = () => Promise<Omit<BriefingSnapshot, 'since'>>;

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
      .briefing-button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border: 1px solid #2c3d45;
        border-radius: 999px; background: #0f191d; color: #e9f3ee; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
      .briefing-button:hover { border-color: #4d6a75; }
      .briefing-button:focus-visible { outline: 2px solid #8ee6a8; outline-offset: 2px; }
      .briefing-button svg { width: 16px; height: 16px; }
      .briefing-button.speaking { border-color: #51d88c; color: #8ee6a8; }
      .briefing-panel { position: absolute; z-index: 70; top: calc(100% + 8px); right: 0; width: min(380px, calc(100vw - 32px)); padding: 14px;
        border: 1px solid #2c3d45; border-radius: 10px; background: #0d171b; color: #e9f3ee; box-shadow: 0 18px 44px #000a; font-size: 13px; }
      .panel-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .panel-actions { display: flex; gap: 6px; }
      .panel-actions button { min-height: 30px; padding: 0 10px; border: 1px solid #2c3d45; border-radius: 6px; background: #13232a;
        color: inherit; font: inherit; cursor: pointer; }
      .panel-actions button:focus-visible, select:focus-visible { outline: 2px solid #8ee6a8; outline-offset: 2px; }
      ol { display: grid; gap: 6px; margin: 12px 0; padding: 0; list-style: none; line-height: 1.5; }
      li { padding: 4px 8px; border-left: 3px solid transparent; border-radius: 4px; color: #c8d2dc; }
      li.current { border-left-color: #51d88c; background: #12301f; color: #fff; }
      .note { margin: 12px 0; color: #c8d2dc; }
      .controls { display: flex; flex-wrap: wrap; gap: 12px; padding-top: 10px; border-top: 1px solid #22323a; }
      label { display: grid; gap: 4px; color: #aebaca; font-size: 12px; }
      select { min-height: 30px; padding: 0 8px; border: 1px solid #2c3d45; border-radius: 6px; background: #13232a; color: #e9f3ee; font: inherit; }
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
      this.service.play(buildBriefing({ ...snapshot, since: this.service.lastAt }), snapshot.now);
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
    if (every > 0 && last && !this.loading() && !this.service.speaking() && now - last.getTime() >= every * 60000) {
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
