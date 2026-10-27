import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** "2026-10-27" for a local calendar date. */
function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function parse(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? { year: +m[1], month: +m[2] - 1, day: +m[3] } : null;
}
function today(): { year: number; month: number; day: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

/**
 * A date field in the site's own style, used in place of the browser's date input whose native calendar
 * clashes with the dark theme. A rounded field opens a calendar card below it: month and arrows to move,
 * a day grid with today ringed and the chosen day filled, then Clear and Today. Arrow keys move by day or
 * week, PageUp/PageDown by month, Enter picks, Escape closes. Values are "YYYY-MM-DD" ('' for none).
 */
@Component({
  selector: 'app-date-field',
  host: { '(document:pointerdown)': 'outside($event)' },
  template: `
    <button type="button" class="date-trigger" [id]="triggerId()" [attr.aria-label]="label() + ': ' + (display() || 'any date')"
      aria-haspopup="dialog" [attr.aria-expanded]="open()" (click)="toggle()" (keydown.arrowDown)="$event.preventDefault(); show()">
      <span [class.placeholder]="!display()">{{ display() || 'Any date' }}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></svg>
    </button>
    @if (open()) {
      <div class="calendar" role="dialog" [attr.aria-label]="label() + ' calendar'" (keydown)="key($event)">
        <div class="calendar-head">
          <b aria-live="polite">{{ monthName() }} {{ view().year }}</b>
          <span>
            <button type="button" class="nav" aria-label="Previous month" (click)="shift(-1)"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg></button>
            <button type="button" class="nav" aria-label="Next month" (click)="shift(1)"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg></button>
          </span>
        </div>
        <div class="grid" role="grid">
          @for (d of days; track d) { <span class="weekday" aria-hidden="true">{{ d }}</span> }
          @for (cell of cells(); track cell.iso) {
            <button type="button" class="day" role="gridcell" [attr.data-day]="cell.iso"
              [class.outside]="!cell.inMonth" [class.today]="cell.iso === todayIso" [class.selected]="cell.iso === value()"
              [attr.aria-selected]="cell.iso === value()" [attr.aria-label]="cell.label" [tabindex]="cell.iso === focusIso() ? 0 : -1"
              (click)="pick(cell.iso)">{{ cell.day }}</button>
          }
        </div>
        <div class="calendar-foot">
          <button type="button" (click)="pick('')">Clear</button>
          <button type="button" (click)="pick(todayIso)">Today</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { position: relative; display: inline-block; }
    .date-trigger { display: inline-flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 150px; height: 38px; padding: 0 12px;
      border: 1px solid var(--surface-tone-08); border-radius: 10px; background: var(--background); color: var(--text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .date-trigger:hover { border-color: var(--surface-tone-86, var(--line)); }
    .date-trigger[aria-expanded="true"] { border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
    .placeholder { color: var(--text-muted); font-weight: 500; }
    svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .date-trigger svg { color: var(--text-muted); }
    .calendar { position: absolute; z-index: 30; top: calc(100% + 8px); left: 0; width: 284px; padding: 14px; border: 1px solid var(--surface-tone-13);
      border-radius: 16px; background: var(--surface-tone-03, var(--surface)); box-shadow: 0 18px 40px var(--shadow-92); animation: rise 0.14s ease-out; }
    .calendar-head { display: flex; align-items: center; justify-content: space-between; margin: 0 2px 10px; }
    .calendar-head b { font-size: 14px; font-weight: 800; letter-spacing: -0.01em; }
    .nav { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; color: var(--text-muted); cursor: pointer; }
    .nav:hover { background: var(--surface-tone-83, var(--surface-raised)); color: var(--text); }
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .weekday { height: 28px; display: grid; place-items: center; color: var(--text-muted); font-size: 11.5px; font-weight: 600; }
    .day { height: 34px; border: 0; border-radius: 9px; background: none; color: var(--text); font: inherit; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; }
    .day:hover { background: var(--surface-tone-83, var(--surface-raised)); }
    .day.outside { color: var(--text-subtle, var(--text-muted)); opacity: 0.55; }
    .day.today { box-shadow: inset 0 0 0 1px var(--surface-tone-86, var(--line)); }
    .day.selected { background: var(--text); color: var(--background); box-shadow: none; }
    .day:focus-visible, .nav:focus-visible, .calendar-foot button:focus-visible, .date-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .calendar-foot { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--surface-tone-13); }
    .calendar-foot button { height: 30px; padding: 0 12px; border: 1px solid var(--surface-tone-87, var(--line)); border-radius: 8px; background: none;
      color: var(--text-tone-19, var(--text)); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
    .calendar-foot button:hover { background: var(--surface-tone-83, var(--surface-raised)); color: var(--text); }
    @keyframes rise { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .calendar { animation: none; } }
  `],
})
export class DateField {
  readonly value = input('');
  readonly label = input('Date');
  readonly triggerId = input<string | null>(null);
  readonly valueChange = output<string>();

  readonly days = DAYS;
  readonly todayIso = iso(today().year, today().month, today().day);
  readonly open = signal(false);
  /** The month on show. */
  readonly view = signal({ year: today().year, month: today().month });
  /** The day keyboard focus sits on inside the grid. */
  readonly focusIso = signal(this.todayIso);
  readonly #host = inject(ElementRef<HTMLElement>);

  readonly monthName = computed(() => MONTHS[this.view().month]);
  /** "Oct 27, 2026" for the chosen date. */
  readonly display = computed(() => {
    const d = parse(this.value());
    return d ? `${MONTHS[d.month].slice(0, 3)} ${d.day}, ${d.year}` : '';
  });
  /** Six weeks starting on the Sunday on or before the 1st. */
  readonly cells = computed(() => {
    const { year, month } = this.view();
    const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        iso: iso(d.getFullYear(), d.getMonth(), d.getDate()),
        day: d.getDate(),
        inMonth: d.getMonth() === month,
        label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      };
    });
  });

  toggle(): void { this.open() ? this.close() : this.show(); }
  show(): void {
    const d = parse(this.value()) ?? today();
    this.view.set({ year: d.year, month: d.month });
    this.focusIso.set(iso(d.year, d.month, d.day));
    this.open.set(true);
    this.#focusDay();
  }
  close(refocus = false): void {
    this.open.set(false);
    if (refocus) { queueMicrotask(() => (this.#host.nativeElement as HTMLElement).querySelector<HTMLElement>('.date-trigger')?.focus()); }
  }
  shift(months: number): void {
    const { year, month } = this.view();
    const d = new Date(year, month + months, 1);
    this.view.set({ year: d.getFullYear(), month: d.getMonth() });
  }
  pick(value: string): void {
    this.valueChange.emit(value);
    this.close(true);
  }
  key(event: KeyboardEvent): void {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key === 'Escape') { event.preventDefault(); this.close(true); return; }
    const at = parse(this.focusIso());
    if (!at || !(event.target as HTMLElement).classList.contains('day')) { return; }
    let next: Date | null = null;
    if (event.key in steps) { next = new Date(at.year, at.month, at.day + steps[event.key]); }
    if (event.key === 'PageUp' || event.key === 'PageDown') { next = new Date(at.year, at.month + (event.key === 'PageUp' ? -1 : 1), at.day); }
    if (!next) { return; }
    event.preventDefault();
    this.focusIso.set(iso(next.getFullYear(), next.getMonth(), next.getDate()));
    this.view.set({ year: next.getFullYear(), month: next.getMonth() });
    this.#focusDay();
  }
  outside(event: Event): void {
    if (this.open() && !(this.#host.nativeElement as HTMLElement).contains(event.target as Node)) { this.close(); }
  }
  #focusDay(): void {
    setTimeout(() => (this.#host.nativeElement as HTMLElement).querySelector<HTMLElement>(`.day[data-day="${this.focusIso()}"]`)?.focus());
  }
}
