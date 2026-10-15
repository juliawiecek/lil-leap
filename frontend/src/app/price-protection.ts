/**
 * Price protection (PS-12): how far a price may move against the client between submitting an
 * order and its fill. The client picks a default and optional per-stock overrides; they are kept
 * in this browser, and the resolved percentage is sent with each order. The orders service records
 * its own reference price and rejects a fill that moved further (reason PRICE_MOVED).
 */
import { Injectable, signal } from '@angular/core';

export interface ProtectionSettings {
  /** Percentage used for any stock without an override. */
  default: number;
  /** Per-stock overrides by symbol, e.g. { AAPL: 3 }. */
  perStock: Record<string, number>;
}

/** The quick choices offered in settings; any value in range can be entered as a custom one. */
export const PROTECTION_CHOICES = [1, 2, 5] as const;
export const MIN_PROTECTION = 0.1;
export const MAX_PROTECTION = 10;
export const DEFAULT_PROTECTION = 2;
export const PROTECTION_STORAGE_KEY = 'nexttrade.priceProtection';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** A valid percentage rounded to two decimals, or null when out of range or not a number. */
export function validProtection(value: unknown): number | null {
  const percent = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(percent) || percent < MIN_PROTECTION || percent > MAX_PROTECTION) {
    return null;
  }
  return Math.round(percent * 100) / 100;
}

/** Settings read back from storage; anything unreadable or out of range falls back to the defaults. */
export function parseProtection(stored: string | null): ProtectionSettings {
  const settings: ProtectionSettings = { default: DEFAULT_PROTECTION, perStock: {} };
  if (!stored) {
    return settings;
  }
  try {
    const raw = JSON.parse(stored) as Partial<ProtectionSettings>;
    settings.default = validProtection(raw.default) ?? DEFAULT_PROTECTION;
    for (const [symbol, percent] of Object.entries(raw.perStock ?? {})) {
      const valid = validProtection(percent);
      if (valid !== null && /^[A-Z0-9.-]{1,20}$/.test(symbol)) {
        settings.perStock[symbol] = valid;
      }
    }
  } catch {
    // A corrupt entry is replaced on the next save.
  }
  return settings;
}

/** The worst price an order accepts: up to price + percent for a buy, down to price - percent for a sell. */
export function protectionLimit(price: number, percent: number, side: 'Buy' | 'Sell'): number {
  const factor = side === 'Buy' ? 1 + percent / 100 : 1 - percent / 100;
  return Math.round(price * factor * 100) / 100;
}

/** "Fills at up to $231.95 (2% above $227.40)" for a buy; "at no less than … (2% below …)" for a sell. */
export function protectionText(price: number, percent: number, side: 'Buy' | 'Sell'): string {
  const limit = USD.format(protectionLimit(price, percent, side));
  const bound = side === 'Buy' ? `Fills at up to ${limit}` : `Fills at no less than ${limit}`;
  return `${bound} (${percent}% ${side === 'Buy' ? 'above' : 'below'} ${USD.format(price)})`;
}

/** The client's price protection settings, shared by both dashboards and kept in this browser. */
@Injectable({ providedIn: 'root' })
export class PriceProtectionStore {
  readonly settings = signal<ProtectionSettings>(parseProtection(readStored()));

  /** The percentage for a stock: its override, otherwise the default. */
  toleranceFor(symbol: string): number {
    const { perStock, default: fallback } = this.settings();
    return perStock[symbol] ?? fallback;
  }

  /** Sets the default; returns false (and changes nothing) when out of range. */
  setDefault(percent: unknown): boolean {
    const valid = validProtection(percent);
    if (valid === null) {
      return false;
    }
    this.#save({ ...this.settings(), default: valid });
    return true;
  }

  /** Sets one stock's override, or removes it when percent is null; false when out of range. */
  setForStock(symbol: string, percent: unknown): boolean {
    const perStock = { ...this.settings().perStock };
    if (percent === null) {
      delete perStock[symbol];
    } else {
      const valid = validProtection(percent);
      if (valid === null) {
        return false;
      }
      perStock[symbol] = valid;
    }
    this.#save({ ...this.settings(), perStock });
    return true;
  }

  #save(settings: ProtectionSettings): void {
    this.settings.set(settings);
    try {
      globalThis.localStorage?.setItem(PROTECTION_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private browsing or full storage: the setting still applies until the page is closed.
    }
  }
}

function readStored(): string | null {
  try {
    return globalThis.localStorage?.getItem(PROTECTION_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
