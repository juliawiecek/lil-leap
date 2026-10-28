import { Component, Directive, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import type { ChartTable } from '../../../shared/chart-description';
import { ChartTools, ChartVoice } from './chart-voice';
import { AccessibilityStore } from './accessibility';
import { ChartSonifier } from './chart-sonification';
import { chartCommand, livePricesPaused, type ChartSound } from './chart-keyboard';

/** Whether two tables say the same thing, cell for cell. */
function sameTable(a: ChartTable, b: ChartTable | undefined): boolean {
  if (a === b) return true;
  if (!b || a.note !== b.note || a.grouped !== b.grouped || a.rows.length !== b.rows.length) return false;
  const line = (cells: readonly string[]) => cells.join('\u0000');
  const refs = (t: ChartTable) => line((t.references ?? []).map(r => r.label + '\u0001' + r.value));
  return line(a.columns) === line(b.columns) && refs(a) === refs(b) && a.rows.every((row, i) => line(row) === line(b.rows[i]));
}

/** Each chart owns its IDs, disclosure state and announcements; toggles never move focus. */
@Component({
  selector: 'app-chart-access',
  template: `
    <!-- Only once Show chart tools is on in Settings > Accessibility; D and T on the chart work either way. -->
    @if (tools.shown()) {
      <div class="actions" role="group" [attr.aria-label]="label() + ' alternatives'">
        <button type="button" (click)="explain()" [attr.aria-expanded]="explained()" [attr.aria-controls]="id() + '-summary'"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 11a9 9 0 1 0-16 6l-2 4 5-2a9 9 0 0 0 13-8Z"/><path d="M8 10h8M8 14h5"/></svg><span>Explain this chart</span></button>
        <button type="button" (click)="shown.set(!shown())" [attr.aria-expanded]="shown()" [attr.aria-controls]="id() + '-table'"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 10v10"/></svg><span>{{ shown() ? 'Hide table' : 'Show as table' }}</span></button>
      </div>
    }
    <p [id]="id() + '-summary'" [class.sr-only]="!explained()">{{ summary() }}</p>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement() }}</p>
    <div [id]="id() + '-table'" [hidden]="!shown()">
      @if (shown()) {
        @if (rawTable() && table().grouped) {
          <button type="button" [attr.aria-pressed]="raw()" (click)="raw.set(!raw())">{{ raw() ? 'Show grouped data' : 'Show every observation' }}</button>
        }
        @if (displayTable().note) { <p>{{ displayTable().note }}</p> }
        <div class="table-scroll" tabindex="0" data-scan-ignore role="region" [attr.aria-label]="label() + ' data table'">
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
  styleUrl: '../../../shared/chart-actions.scss',
  styles: [`
    :host {
      display: block; min-width: 0; color: var(--text); font-size: 13px;
      --chart-action-border: color-mix(in srgb, var(--text-muted) 30%, transparent);
      --chart-action-surface: var(--surface-raised);
      --chart-action-muted: var(--text-muted);
      --chart-action-accent: var(--accent);
      --chart-action-on-accent: var(--on-accent);
      --chart-action-focus: var(--focus);
    }
    p { line-height: 1.6; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .table-scroll { max-height: 360px; overflow: auto; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    caption { text-align: left; padding: 8px; font-weight: 600; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--control-border); white-space: nowrap; }
    th { font-weight: 600; }
    /* Values line up on their decimal places; the row label column stays left-aligned. */
    td, thead th:not(:first-child) { text-align: right; }
    td[colspan] { text-align: left; }
    [hidden] { display: none !important; }
    @media (forced-colors: active) { button { border-color: ButtonText; } th, td { border-color: CanvasText; } }
  `],
})
export class ChartAccess implements OnDestroy {
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
  readonly voice = inject(ChartVoice);
  readonly tools = inject(ChartTools);
  readonly playing = signal(false);
  readonly #store = inject(AccessibilityStore);
  #sonifier: ChartSonifier | undefined;
  #previous: string | undefined;
  #previousTable: ChartTable | undefined;
  #context = '';
  #pendingContext = false;
  constructor() {
    effect(onCleanup => {
      const text = this.summary(), context = this.context(), table = this.table();
      const contextChanged = this.#previous !== undefined && context !== this.#context;
      // A chart freezing its data for inspection hands over an equal table: that is not an update.
      const changed = this.#previous !== undefined && (text !== this.#previous || !sameTable(table, this.#previousTable) || contextChanged);
      const privacyChanged = /hidden/i.test(text) && !/hidden/i.test(this.#previous ?? '');
      if (contextChanged) { this.#pendingContext = true; }
      const fullAnnouncement = this.#pendingContext || privacyChanged;
      this.#previous = text; this.#context = context; this.#previousTable = table;
      untracked(() => {
        if (contextChanged || privacyChanged) { this.voice.stop(this.id()); }
        if (!changed) { return; }
        this.announcement.set('');
        // Live prices do not make every chart on a page talk at once. Announce the chart in use,
        // or the result of a deliberate period/security change, after updates have settled.
        if (fullAnnouncement || this.focused() || this.explained() || this.shown()) {
          const timer = setTimeout(() => {
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
    if (this.explained()) { this.announce(this.summary()); this.voice.speak(this.summary(), this.id(), true); }
    else { this.voice.stop(this.id()); }
  }
  focusSummary(): void { this.focused.set(true); this.voice.speak(this.summary(), this.id()); }
  /**
   * Says `text` in the polite live region (PS-26). Saying the same thing twice in a row, such as
   * pressing Right on the last point, still gets read: the repeat differs by an invisible space.
   */
  announce(text: string): void {
    this.announcement.set(text === this.announcement() ? text + ' ' : text);
  }
  /** D on a focused chart: Explain this chart, or read its summary again when already shown. */
  readSummary(): void {
    if (!this.explained()) { this.explain(); return; }
    this.announce(this.summary());
    this.voice.speak(this.summary(), this.id(), true);
  }
  /** T on a focused chart: Show as table or Hide table. Focus stays on the chart. */
  toggleTable(): void {
    this.shown.set(!this.shown());
    this.announce(this.shown() ? `${this.label()} data table shown after the chart.` : `${this.label()} data table hidden.`);
  }
  /**
   * Space on a focused chart: plays it as sound, or stops it (PS-26). Only ever started by a key
   * press, so it is the person's own action; live-update pauses and reduced motion only block
   * playback the app would start by itself, which charts never do.
   */
  toggleSound(sound: ChartSound): void {
    const player = this.#sonifier ??= new ChartSonifier({
      paused: () => this.#store.read('livePrices', livePricesPaused),
      onEnd: () => this.playing.set(false),
    });
    if (player.playing) { player.stop(); this.announce('Sound stopped.'); return; }
    if (player.play(sound.points, { markers: sound.markers, averageCost: sound.averageCost })) {
      this.playing.set(true);
      this.announce('Playing the chart as sound. Press Space again to stop.');
    } else {
      this.announce(sound.points.length ? 'Sound is not available in this browser.' : 'There are no prices to play yet.');
    }
  }
  stopSound(): void { this.#sonifier?.stop(); }
  ngOnDestroy(): void { this.voice.stop(this.id()); this.#sonifier?.dispose(); }
}

@Directive({ selector: '[appChartFocus]', host: {
  'class': 'chart-focus-target',
  // Use the existing scanner's ignore/group hooks, keeping graphics available to Tab users.
  '[attr.data-scan-ignore]': 'chartScanChildren() ? null : ""',
  '(focus)': 'access().focusSummary()', '(blur)': 'access().focused.set(false)',
  '[attr.aria-describedby]': 'access().id() + "-summary"',
  '(keydown)': 'command($event)',
} })
export class ChartFocus {
  readonly access = input.required<ChartAccess>({ alias: 'appChartFocus' });
  readonly chartScanChildren = input(false);
  /** What Space plays; charts without it leave Space alone. */
  readonly chartSound = input<(() => ChartSound) | null>(null);
  /** D reads the summary, T toggles the table, Space plays or stops the sound, Escape stops it (PS-26). */
  command(event: KeyboardEvent): void {
    if (event.key === 'Escape') { this.access().stopSound(); return; }
    const command = chartCommand(event), sound = this.chartSound();
    if (!command || (command === 'sound' && !sound)) return;
    event.preventDefault();
    if (command === 'summary') this.access().readSummary();
    else if (command === 'table') this.access().toggleTable();
    else this.access().toggleSound(sound!());
  }
}
