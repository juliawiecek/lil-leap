import { Component, computed, inject, input, signal } from '@angular/core';
import {
  MAX_PROTECTION, MIN_PROTECTION, PROTECTION_CHOICES, PriceProtectionStore,
} from './price-protection';

const OUT_OF_RANGE = `Choose a value from ${MIN_PROTECTION}% to ${MAX_PROTECTION}%.`;

/**
 * Settings rows for price protection (PS-12): a default and per-stock overrides. Laid out like the
 * other settings rows (label on the left, control on the right) and themed by the dashboard's
 * --line, --muted and --green colours.
 */
@Component({
  selector: 'app-price-protection-settings',
  template: `
    <div class="setting-row" data-glossary="price-protection">
      <div class="setting-label">
        <span id="protection-label">Price protection</span>
        <small>Orders are rejected, with nothing charged, if the price moves against you by more than this before they fill.</small>
      </div>
      <div class="segmented" role="group" aria-labelledby="protection-label">
        @for (choice of choices; track choice) {
          <button
            type="button"
            [class.selected]="store.settings().default === choice"
            [attr.aria-pressed]="store.settings().default === choice"
            (click)="setDefault(choice)"
          >
            {{ choice }}%
          </button>
        }
        <label class="custom" [class.selected]="custom() !== null">
          <span class="sr-only">Custom percentage</span>
          <input
            type="number"
            [min]="min"
            [max]="max"
            step="0.1"
            placeholder="Custom"
            [value]="custom() ?? ''"
            (change)="setDefault($any($event.target).value)"
          />
          <span aria-hidden="true">%</span>
        </label>
      </div>
    </div>

    <div class="setting-row" data-glossary="price-protection">
      <div class="setting-label">
        <span id="overrides-label">Per-stock overrides</span>
        <small>A different limit for particular stocks.</small>
      </div>
      <div class="overrides" role="group" aria-labelledby="overrides-label">
        @for (entry of overrides(); track entry.symbol) {
          <span class="chip">
            {{ entry.symbol }} <b>{{ entry.percent }}%</b>
            <button type="button" [attr.aria-label]="'Remove ' + entry.symbol + ' override'" (click)="remove(entry.symbol)">×</button>
          </span>
        }
        <div class="add-override">
          <select #stock aria-label="Stock for an override">
            @for (symbol of symbols(); track symbol) {
              <option [value]="symbol">{{ symbol }}</option>
            }
          </select>
          <label class="percent-field">
            <input #percent type="number" [min]="min" [max]="max" step="0.1" placeholder="2" aria-label="Override percentage" />
            <span aria-hidden="true">%</span>
          </label>
          <button type="button" class="add" (click)="addOverride(stock.value, percent.value)">Add</button>
        </div>
      </div>
    </div>
    @if (message()) {
      <p class="message" role="alert">{{ message() }}</p>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .setting-row {
        display: flex; flex-direction: column; align-items: flex-start; gap: 12px;
        padding: 16px 0 20px; border-bottom: 1px solid var(--line);
      }
      .setting-label { display: grid; gap: 3px; max-width: 520px; }
      .setting-label > span { font-size: 14px; font-weight: 600; }
      .setting-label small { color: var(--muted); font-size: 12.5px; line-height: 1.5; }
      .segmented {
        display: inline-flex; align-items: center; gap: 2px; padding: 3px;
        border: 1px solid var(--line); border-radius: 8px; background: var(--shadow-99);
      }
      .segmented button {
        min-width: 48px; height: 32px; padding: 0 12px; border: 0; border-radius: 6px; background: none;
        color: var(--muted); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .segmented button:hover { color: var(--text); }
      .segmented button.selected { background: var(--protection-selected-bg, var(--accent)); color: var(--protection-selected-text, var(--on-accent)); }
      .segmented .custom {
        display: inline-flex; align-items: center; gap: 2px; height: 32px; margin-left: 2px; padding: 0 10px;
        border-left: 1px solid var(--line); color: var(--muted); font-size: 13px; font-weight: 600;
      }
      .segmented .custom.selected {
        background: var(--protection-selected-bg, transparent);
        color: var(--protection-selected-text, var(--text));
        border-radius: 6px;
      }
      .segmented .custom.selected input { color: inherit; }
      .custom input {
        width: 56px; padding: 0; border: 0; background: none; color: var(--text); font: inherit; text-align: right; outline: none;
      }
      .custom input::placeholder { color: var(--muted); }
      .overrides { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .chip {
        display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 4px 0 12px;
        border: 1px solid var(--line); border-radius: 6px; font-size: 13px; font-weight: 700;
      }
      .chip b { color: var(--muted); font-weight: 600; }
      .chip button {
        width: 22px; height: 22px; border: 0; border-radius: 4px; background: none;
        color: var(--muted); font-size: 14px; line-height: 1; cursor: pointer;
      }
      .chip button:hover { color: var(--text); background: var(--text-wash-14); }
      .add-override { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      select, .percent-field {
        height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px;
        background-color: var(--shadow-99); color: inherit; font-size: 13px; font-weight: 600; color-scheme: dark;
      }
      .percent-field { display: inline-flex; align-items: center; gap: 2px; color: var(--muted); }
      .percent-field input { width: 34px; padding: 0; border: 0; background: none; color: var(--text); font: inherit; text-align: right; outline: none; }
      .add {
        height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 6px; background: none;
        color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .add:hover { border-color: var(--muted); }
      input[type='number'] { appearance: textfield; -moz-appearance: textfield; }
      input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { margin: 0; -webkit-appearance: none; }
      .message { margin: 10px 0 0; color: var(--warning); font-size: 12px; }
      .sr-only {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap; border: 0;
      }
      @media (max-width: 760px) {
        .setting-row { flex-direction: column; align-items: stretch; gap: 12px; }
        .overrides { justify-content: flex-start; }
      }
    `,
  ],
})
export class PriceProtectionSettings {
  /** Stocks the client can set an override for. */
  readonly symbols = input<readonly string[]>([]);

  readonly store = inject(PriceProtectionStore, { optional: true }) ?? new PriceProtectionStore();
  readonly choices = PROTECTION_CHOICES;
  readonly min = MIN_PROTECTION;
  readonly max = MAX_PROTECTION;
  readonly message = signal('');
  /** The default when it is not one of the quick choices. */
  readonly custom = computed(() => {
    const value = this.store.settings().default;
    return (PROTECTION_CHOICES as readonly number[]).includes(value) ? null : value;
  });
  readonly overrides = computed(() =>
    Object.entries(this.store.settings().perStock)
      .map(([symbol, percent]) => ({ symbol, percent }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
  );

  setDefault(value: unknown): void {
    this.message.set(this.store.setDefault(value) ? '' : OUT_OF_RANGE);
  }

  addOverride(symbol: string, percent: string): void {
    if (!symbol) {
      return;
    }
    this.message.set(this.store.setForStock(symbol, percent) ? '' : OUT_OF_RANGE);
  }

  remove(symbol: string): void {
    this.store.setForStock(symbol, null);
  }
}
