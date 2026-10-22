import { Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { formatCurrency, formatNumber, getCurrencySymbol, getNumberOfCurrencyDigits } from '@angular/common';

export type ChangeUnit = 'currency' | 'percent' | 'number';
export function movement(value: number): 'up' | 'down' | 'flat' {
  return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
}

/**
 * Presentation only: the input and every financial calculation remain untouched.
 *
 * `arrow` is false for a value quoted beside another one (the percentage after an amount), where
 * the leading value already carries the triangle; the sign is always kept so direction survives
 * in grayscale.
 */
export function describeChange(value: number | null, unit: ChangeUnit = 'percent', currency = 'USD', locale = 'en-US', digits?: string, arrow = true) {
  if (value === null || !Number.isFinite(value)) {
    return { visual: '—', spoken: 'Change unavailable', direction: 'flat' };
  }
  const direction = movement(value);
  const amount = unit === 'currency'
    ? formatCurrency(Math.abs(value), locale, getCurrencySymbol(currency, 'wide', locale), currency, digits)
    : formatNumber(Math.abs(value), locale, digits ?? '1.2-2');
  const symbol = (arrow ? { up: '▲ +', down: '▼ −', flat: '— ' } : { up: '+', down: '−', flat: '' })[direction];
  const measure = unit === 'percent' ? ' percent' : unit === 'currency' ? ` ${currency}` : '';
  const precision = unit === 'currency' ? getNumberOfCurrencyDigits(currency) : 2;
  const spokenAmount = formatNumber(Math.abs(value), locale, digits ?? `1.${precision}-${precision}`);
  const verb = direction === 'flat' ? 'Unchanged at' : direction === 'up' ? 'Increased by' : 'Decreased by';
  return {
    visual: symbol + amount + (unit === 'percent' ? '%' : ''),
    spoken: arrow
      ? `${verb} ${spokenAmount}${measure}`
      : `${direction === 'down' ? 'minus ' : ''}${spokenAmount}${measure}`,
    direction,
  };
}

@Component({
  selector: 'app-financial-change',
  template: `<span aria-hidden="true">{{ formatted().visual }}@if (percent() !== null) { ({{ percentage().visual }})}</span><span class="sr-only">{{ formatted().spoken }}@if (percent() !== null) {, {{ percentage().spoken }}}</span>`,
  styles: [`:host { white-space: nowrap; font-variant-numeric: tabular-nums; } :host(.flat) { color: var(--text-muted); }`],
  host: { '[class.flat]': 'formatted().direction === "flat"', '[attr.data-movement]': 'formatted().direction' },
})
export class FinancialChange {
  readonly value = input.required<number | null>();
  readonly unit = input<ChangeUnit>('percent');
  readonly currency = input('USD');
  readonly digits = input<string>();
  readonly percent = input<number | null>(null);
  readonly #locale = inject(LOCALE_ID);
  readonly formatted = computed(() => describeChange(this.value(), this.unit(), this.currency(), this.#locale, this.digits()));
  readonly percentage = computed(() => describeChange(this.percent(), 'percent', this.currency(), this.#locale, undefined, false));
}
