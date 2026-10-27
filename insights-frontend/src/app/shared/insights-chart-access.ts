import { Component, Injectable, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import type { ChartTable } from '../../../../shared/chart-description';
import { ChartNarrator } from '../../../../shared/chart-narrator';
import { SiteAccessibility } from '../site-accessibility';

/** The shortest gap between two "Chart data updated" announcements for one chart. */
const UPDATE_NOTICE_EVERY_MS = 60_000;

/** Both report charts share one stored opt-in and one owned speech channel. */
@Injectable({ providedIn: 'root' })
export class InsightsChartVoice {
  private readonly accessibility = inject(SiteAccessibility);
  readonly enabled = signal(this.readEnabled());
  private readonly narrator = new ChartNarrator();
  private owner = '';
  private readEnabled(): boolean {
    try { return globalThis.localStorage?.getItem('nexttrade-insights.chart-voice') === 'on'; }
    catch { return false; }
  }
  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
    if (!enabled) { this.stop(this.owner); }
    try { globalThis.localStorage?.setItem('nexttrade-insights.chart-voice', enabled ? 'on' : 'off'); } catch {}
  }
  speak(text: string, owner: string, requested = false): void {
    const navigation = this.accessibility.settings();
    if (!requested && navigation.enabled && navigation.focus) { return; }
    if (this.enabled()) { this.owner = owner; this.narrator.speak(text, owner, navigation.rate); }
  }
  stop(owner: string): void { this.narrator.stop(owner); }
}

/** Each chart owns its IDs, disclosure state and announcements; toggles never move focus. */
@Component({
  selector: 'app-insights-chart-access',
  template: `
    <div class="actions" role="group" [attr.aria-label]="label() + ' alternatives'">
      <button type="button" (click)="explain()" [attr.aria-expanded]="explained()" [attr.aria-controls]="id() + '-summary'"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 11a9 9 0 1 0-16 6l-2 4 5-2a9 9 0 0 0 13-8Z"/><path d="M8 10h8M8 14h5"/></svg><span>Explain this chart</span></button>
      <button type="button" (click)="shown.set(!shown())" [attr.aria-expanded]="shown()" [attr.aria-controls]="id() + '-table'"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 10v10"/></svg><span>{{ shown() ? 'Hide table' : 'Show as table' }}</span></button>
      <label class="voice"><input type="checkbox" [checked]="voice.enabled()" (change)="voice.setEnabled($any($event.target).checked)" />Read chart summaries aloud</label>
    </div>
    <p [id]="id() + '-summary'" [class.sr-only]="!explained()">{{ summary() }}</p>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement() }}</p>
    <div [id]="id() + '-table'" [hidden]="!shown()">
      @if (shown()) {
        @if (rawTable() && table().grouped) {
          <button type="button" [attr.aria-pressed]="raw()" (click)="raw.set(!raw())">{{ raw() ? 'Show grouped data' : 'Show every observation' }}</button>
        }
        @if (displayTable().note) { <p>{{ displayTable().note }}</p> }
        <div class="table-scroll" tabindex="0" role="region" [attr.aria-label]="label() + ' data table'">
          <table>
            <caption>{{ label() }} — data table</caption>
            <thead><tr>@for (column of displayTable().columns; track $index) { <th scope="col">{{ column }}</th> }</tr></thead>
            <tbody>
              @for (row of displayTable().rows; track $index) {
                <tr>@for (cell of row; track $index) { @if ($first) { <th scope="row">{{ cell }}</th> } @else { <td>{{ cell }}</td> } }</tr>
              } @empty { <tr><td [attr.colspan]="displayTable().columns.length">No observations available in this view.</td></tr> }
            </tbody>
            @if (displayTable().references?.length) {
              <tfoot>@for (reference of displayTable().references; track reference.label) {
                <tr><th scope="row">{{ reference.label }}</th><td [attr.colspan]="displayTable().columns.length - 1">{{ reference.value }}</td></tr>
              }</tfoot>
            }
          </table>
        </div>
      }
    </div>`,
  styleUrl: '../../../../shared/chart-actions.scss',
  styles: [`
    :host {
      display: block; min-width: 0; color: var(--text); font-size: 13px;
      --chart-action-border: var(--line);
      --chart-action-surface: var(--bg);
      --chart-action-muted: var(--muted);
      --chart-action-accent: var(--accent);
      --chart-action-on-accent: var(--bg);
      --chart-action-focus: var(--accent);
    }
    .voice { display: flex; align-items: center; gap: 6px; min-height: 32px; }
    input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    p { line-height: 1.6; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .table-scroll { max-height: 360px; overflow: auto; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    caption { text-align: left; padding: 8px; font-weight: 600; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
    th { font-weight: 600; }
    [hidden] { display: none !important; }
    @media (forced-colors: active) { button { border-color: ButtonText; } th, td { border-color: CanvasText; } }
  `],
})
export class InsightsChartAccess implements OnDestroy {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly summary = input.required<string>();
  readonly table = input.required<ChartTable>();
  readonly rawTable = input<ChartTable | null>(null);
  readonly context = input('');
  readonly explained = signal(false);
  readonly shown = signal(false);
  readonly raw = signal(false);
  readonly focused = signal(false);
  readonly announcement = signal('');
  readonly displayTable = computed(() => this.raw() && this.rawTable() ? this.rawTable()! : this.table());
  readonly voice = inject(InsightsChartVoice);
  #previous: string | undefined;
  #previousTable: ChartTable | undefined;
  #context = '';
  #pendingContext = false;
  /** When "Chart data updated" was last said; 0 until the first time. */
  #updatedAt = 0;
  constructor() {
    effect(onCleanup => {
      const text = this.summary(), context = this.context(), table = this.table();
      const contextChanged = this.#previous !== undefined && context !== this.#context;
      const changed = this.#previous !== undefined && (text !== this.#previous || table !== this.#previousTable || contextChanged);
      const privacyChanged = /hidden/i.test(text) && !/hidden/i.test(this.#previous ?? '');
      if (contextChanged) { this.#pendingContext = true; }
      const fullAnnouncement = this.#pendingContext || privacyChanged;
      this.#previous = text; this.#context = context; this.#previousTable = table;
      untracked(() => {
        if (contextChanged || privacyChanged) { this.voice.stop(this.id()); }
        if (!changed) { return; }
        // Live prices do not make every chart on a page talk at once. Announce the chart in use,
        // or the result of a deliberate period/security change, after updates have settled. The
        // pages refresh every few seconds, so "updated" is said at most once a minute (PS-29).
        const quiet = !fullAnnouncement && Date.now() - this.#updatedAt < UPDATE_NOTICE_EVERY_MS;
        if (!quiet && (fullAnnouncement || this.focused() || this.explained() || this.shown())) {
          this.announcement.set('');
          const timer = setTimeout(() => {
            if (!fullAnnouncement) { this.#updatedAt = Date.now(); }
            this.announcement.set(fullAnnouncement ? text : 'Chart data updated. Explain this chart to hear the latest summary.');
            if (fullAnnouncement && (this.focused() || this.explained())) { this.voice.speak(text, this.id()); }
            if (!/loading|No recorded observations/i.test(text)) { this.#pendingContext = false; }
          }, 600);
          onCleanup(() => clearTimeout(timer));
        }
      });
    });
  }
  explain(): void {
    this.explained.set(!this.explained());
    if (this.explained()) { this.announcement.set(this.summary()); this.voice.speak(this.summary(), this.id(), true); }
    else { this.voice.stop(this.id()); }
  }
  focusSummary(): void { this.focused.set(true); this.voice.speak(this.summary(), this.id()); }
  ngOnDestroy(): void { this.voice.stop(this.id()); }
}
