import { Component, computed, inject, input, signal } from '@angular/core';
import {
  MAX_PROTECTION, MIN_PROTECTION, PROTECTION_CHOICES, PriceProtectionStore,
} from './price-protection';

const OUT_OF_RANGE = `Choose a value from ${MIN_PROTECTION}% to ${MAX_PROTECTION}%.`;

/** Settings section for price protection (PS-12): a default and per-stock overrides. */
@Component({
  selector: 'app-price-protection-settings',
  template: `
    <section class="protection-settings" aria-labelledby="protection-heading">
      <h3 id="protection-heading">Price protection</h3>
      <p class="hint">
        If the price moves against you by more than this before your order fills, it is rejected and
        nothing is charged.
      </p>
      <div class="choices" role="group" aria-label="Default price protection">
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
        <label>
          Custom
          <input
            type="number"
            [min]="min"
            [max]="max"
            step="0.1"
            [value]="custom() ?? ''"
            (change)="setDefault($any($event.target).value)"
          />
          %
        </label>
      </div>

      <h4>Per-stock overrides</h4>
      @for (entry of overrides(); track entry.symbol) {
        <div class="override">
          <span>{{ entry.symbol }}</span><strong>{{ entry.percent }}%</strong>
          <button type="button" class="text-link" (click)="remove(entry.symbol)">Remove</button>
        </div>
      } @empty {
        <p class="hint">None yet. Every stock uses your default.</p>
      }
      <div class="override-form" role="group" aria-label="Add a per-stock override">
        <label>
          Stock
          <select #stock aria-label="Stock for an override">
            @for (symbol of symbols(); track symbol) {
              <option [value]="symbol">{{ symbol }}</option>
            }
          </select>
        </label>
        <label>
          Protection
          <input #percent type="number" [min]="min" [max]="max" step="0.1" aria-label="Override percentage" />
          %
        </label>
        <button type="button" class="secondary-button" (click)="addOverride(stock.value, percent.value)">Add override</button>
      </div>
      @if (message()) {
        <p class="message" role="alert">{{ message() }}</p>
      }
    </section>
  `,
  styles: [
    `
      .protection-settings { display: grid; gap: 10px; }
      h3, h4 { margin: 4px 0 0; }
      .hint { margin: 0; color: var(--muted, #8b98a5); font-size: 12px; }
      .choices, .override-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .choices button { min-width: 48px; padding: 5px 10px; border: 1px solid var(--line, #2b3941); border-radius: 6px; }
      .choices button.selected { background: var(--green, #63d68c); color: #0e2a1b; font-weight: 600; }
      input { width: 64px; }
      .override { display: flex; align-items: center; gap: 12px; }
      .message { margin: 0; color: #f0a35e; }
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
