import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'nexttrade.trading-preferences';
const DEFAULT_PRICE_PROTECTION_PERCENT = 2;
const MAX_PRICE_PROTECTION_PERCENT = 10;

export interface TradingPreferences {
  priceProtectionPercent: number;
}

/** Shared trader preferences used by both dashboard experiences. */
@Injectable({ providedIn: 'root' })
export class TradingPreferencesService {
  readonly priceProtectionPercent = signal(this.read().priceProtectionPercent);

  setPriceProtectionPercent(value: number): void {
    const normalized = normalizePercent(value);
    this.priceProtectionPercent.set(normalized);
    this.write({ priceProtectionPercent: normalized });
  }

  private read(): TradingPreferences {
    if (typeof localStorage === 'undefined') {
      return { priceProtectionPercent: DEFAULT_PRICE_PROTECTION_PERCENT };
    }
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<TradingPreferences>;
      return { priceProtectionPercent: normalizePercent(stored.priceProtectionPercent) };
    } catch {
      return { priceProtectionPercent: DEFAULT_PRICE_PROTECTION_PERCENT };
    }
  }

  private write(preferences: TradingPreferences): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
  }
}

export function normalizePercent(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PRICE_PROTECTION_PERCENT;
  }
  return Math.min(MAX_PRICE_PROTECTION_PERCENT, Math.max(0, Math.round(value! * 100) / 100));
}

export const PRICE_PROTECTION_MIN_PERCENT = 0;
export const PRICE_PROTECTION_MAX_PERCENT = MAX_PRICE_PROTECTION_PERCENT;