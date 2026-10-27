import { Injectable, computed, signal } from '@angular/core';
import { accessibilityStore } from './accessibility';
import { stockName } from './speech-text';

/**
 * Live price settings (PS-21), kept in the "livePrices" section of the Accessibility settings
 * store: pausing live updates (WCAG 2.2.2), and Price watch, which tells screen reader users when
 * a stock they picked moves by at least the amount they chose, at most once every 10 seconds.
 */

export interface PriceWatchSettings {
  enabled: boolean;
  /** Stocks to watch, by symbol. */
  symbols: string[];
  /** Smallest move, in percent since the last alert, worth an alert. */
  threshold: number;
}

export interface LivePricesSettings {
  /** The ticker stops scrolling and prices stop refreshing. */
  paused: boolean;
  watch: PriceWatchSettings;
}

export const WATCH_THRESHOLDS = [
  { value: 0.1, label: '0.1%' },
  { value: 0.25, label: '0.25%' },
  { value: 0.5, label: '0.5%' },
  { value: 1, label: '1%' },
  { value: 2, label: '2%' },
  { value: 5, label: '5%' },
];
/** At most one Price watch message in this many milliseconds. */
export const PRICE_WATCH_INTERVAL_MS = 10000;

const DEFAULTS: LivePricesSettings = { paused: false, watch: { enabled: false, symbols: [], threshold: 1 } };

/** Saved settings, or the defaults for anything missing or not valid. */
export function parseLivePrices(saved: unknown): LivePricesSettings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<LivePricesSettings>;
  const w = (s.watch && typeof s.watch === 'object' ? s.watch : {}) as Partial<PriceWatchSettings>;
  const symbols = Array.isArray(w.symbols) ? w.symbols.filter((x): x is string => typeof x === 'string' && /^[A-Z.]{1,6}$/.test(x)) : [];
  return {
    paused: s.paused === true,
    watch: {
      enabled: w.enabled === true,
      symbols: [...new Set(symbols)],
      threshold: WATCH_THRESHOLDS.some((t) => t.value === w.threshold) ? w.threshold! : DEFAULTS.watch.threshold,
    },
  };
}

@Injectable({ providedIn: 'root' })
export class LivePricesService {
  readonly #store = accessibilityStore();
  readonly settings = signal<LivePricesSettings>(this.#store.read('livePrices', parseLivePrices));
  readonly paused = computed(() => this.settings().paused);

  setPaused(paused: boolean): void {
    this.#save({ ...this.settings(), paused });
  }

  updateWatch(change: Partial<PriceWatchSettings>): void {
    this.#save({ ...this.settings(), watch: { ...this.settings().watch, ...change } });
  }

  /** Adds a stock to Price watch, or removes it when it is already watched. */
  toggleWatched(symbol: string): void {
    const symbols = this.settings().watch.symbols;
    this.updateWatch({ symbols: symbols.includes(symbol) ? symbols.filter((s) => s !== symbol) : [...symbols, symbol] });
  }

  #save(next: LivePricesSettings): void {
    this.settings.set(parseLivePrices(next));
    this.#store.write('livePrices', this.settings());
  }
}

/** "Apple up 1.3 percent" or "Microsoft down 3 percent": one decimal, without a trailing ".0". */
export function priceMoveText(symbol: string, percent: number): string {
  const size = Math.abs(percent).toFixed(1).replace(/\.0$/, '');
  return `${stockName(symbol) ?? symbol} ${percent < 0 ? 'down' : 'up'} ${size} percent`;
}

/** One message for every alert due: "Price alert: Apple up 1.3 percent." or "2 alerts: …". */
export function priceWatchMessage(alerts: readonly { symbol: string; move: number }[]): string {
  const moves = alerts.map((a) => priceMoveText(a.symbol, a.move));
  if (moves.length === 1) {
    return `Price alert: ${moves[0]}.`;
  }
  return `${moves.length} alerts: ${moves.join(', ')}.`;
}

/**
 * Decides when Price watch speaks. Each watched stock's move is measured from its price when
 * watching began or when it was last announced. Moves past the threshold wait until 10 seconds
 * have passed since the last message, then go out together in one message.
 */
export class PriceWatcher {
  readonly #baselines = new Map<string, number>();
  readonly #pending = new Map<string, number>();
  #lastAt = Number.NEGATIVE_INFINITY;

  /** Call on every price refresh; returns the message to announce now, or null. */
  update(quotes: readonly { symbol: string; price: number }[], watch: PriceWatchSettings, now: number): string | null {
    if (!watch.enabled) {
      this.#baselines.clear();
      this.#pending.clear();
      return null;
    }
    const watched = new Set(watch.symbols);
    for (const symbol of this.#baselines.keys()) {
      if (!watched.has(symbol)) {
        this.#baselines.delete(symbol);
        this.#pending.delete(symbol);
      }
    }
    const prices = new Map<string, number>();
    for (const { symbol, price } of quotes) {
      if (!watched.has(symbol) || !(price > 0)) {
        continue;
      }
      prices.set(symbol, price);
      const base = this.#baselines.get(symbol);
      if (base === undefined) {
        this.#baselines.set(symbol, price);
        continue;
      }
      const move = ((price - base) / base) * 100;
      if (Math.abs(move) + 1e-9 >= watch.threshold) {
        this.#pending.set(symbol, move);
      } else {
        // Back within the threshold before it was said: no longer news.
        this.#pending.delete(symbol);
      }
    }
    if (!this.#pending.size || now - this.#lastAt < PRICE_WATCH_INTERVAL_MS) {
      return null;
    }
    const alerts = [...this.#pending].map(([symbol, move]) => ({ symbol, move }));
    for (const { symbol } of alerts) {
      this.#baselines.set(symbol, prices.get(symbol) ?? this.#baselines.get(symbol)!);
    }
    this.#pending.clear();
    this.#lastAt = now;
    return priceWatchMessage(alerts);
  }
}
