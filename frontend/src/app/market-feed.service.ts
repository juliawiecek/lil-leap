import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { QUOTE_REFRESH_MS } from './portfolio-api';
import { MARKET_STATUS_REFRESH_MS, MarketStatus, MarketStatusClient } from './market-status-api';
import { LiveQuote, MarketFeedClient, changeFrom, unpriced } from './market-feed-api';

/**
 * One shared feed of live prices and market status for every view (TS-14.7, PS-02).
 *
 * Prices for every listed stock refresh every 5 s whether or not the client holds it, and market
 * status every 60 s. Polling pauses while the tab is hidden and refreshes immediately when it is
 * shown again; it stops when the last view releases it or the user signs out.
 */
@Injectable({ providedIn: 'root' })
export class MarketFeed {
  client = new MarketFeedClient(inject(AuthService, { optional: true }) ?? { accessToken: null });
  statusClient = new MarketStatusClient(inject(AuthService, { optional: true }) ?? { accessToken: null });

  readonly quotes = signal<LiveQuote[]>([]);
  readonly status = signal<MarketStatus | null>(null);
  /** Time of the last refresh, so "Price delayed" re-evaluates without its own timer. */
  readonly now = signal(Date.now());

  #users = 0;
  #quoteTimer: ReturnType<typeof setTimeout> | undefined;
  #statusTimer: ReturnType<typeof setTimeout> | undefined;
  #opens = new Map<string, number>();
  #openDay = '';
  readonly #listeners = new Set<() => void>();
  readonly #onVisibility = (): void => {
    if (!this.hidden) {
      void this.refreshQuotes();
      void this.refreshStatus();
    }
  };

  /** Starts the feed for a view; call the returned function when the view goes away. */
  start(): () => void {
    this.#users += 1;
    if (this.#users === 1) {
      globalThis.document?.addEventListener('visibilitychange', this.#onVisibility);
      void this.refreshQuotes();
      void this.refreshStatus();
      this.#scheduleQuotes();
      this.#scheduleStatus();
    }
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.#release();
      }
    };
  }

  /** Calls the listener after each price refresh; returns an unsubscribe. */
  onUpdate(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The live quote for a symbol, if listed. */
  quote(symbol: string): LiveQuote | undefined {
    return this.quotes().find((q) => q.symbol === symbol);
  }

  get running(): boolean {
    return this.#users > 0;
  }

  get hidden(): boolean {
    return globalThis.document?.hidden === true;
  }

  /** Loads the stock list if needed, then every stock's latest price. A failed stock keeps its last price. */
  async refreshQuotes(): Promise<void> {
    if (!this.#canPoll()) {
      return;
    }
    if (!this.quotes().length) {
      await this.#loadInstruments();
    }
    const listed = this.quotes();
    await this.#loadOpens(listed);
    const ticks = await Promise.allSettled(listed.map((q) => this.client.latest(q.instrumentId)));
    if (!this.running) {
      return;
    }
    this.now.set(Date.now());
    this.quotes.set(
      listed.map((quote, i) => {
        const result = ticks[i];
        if (result.status === 'rejected') {
          return { ...quote, direction: null };
        }
        const { price, bid, ask, quotedAt } = result.value;
        const direction = moveOf(quote.price, price);
        return {
          ...quote,
          price,
          bid,
          ask,
          quotedAt,
          change: changeFrom(this.#opens.get(quote.instrumentId), price),
          direction,
          version: direction ? quote.version + 1 : quote.version,
        };
      }),
    );
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /** Re-reads whether the market is open; a failure keeps the last status shown. */
  async refreshStatus(): Promise<void> {
    if (!this.#canPoll()) {
      return;
    }
    try {
      this.status.set(await this.statusClient.status());
    } catch {
      // The next refresh retries.
    }
  }

  #canPoll(): boolean {
    if (!this.client.signedIn) {
      this.#halt();
      return false;
    }
    return this.running && !this.hidden;
  }

  async #loadInstruments(): Promise<void> {
    try {
      this.quotes.set((await this.client.instruments()).map(unpriced));
    } catch {
      // Retried on the next refresh.
    }
  }

  /** Reads each stock's first quote of the day once per day; a failure leaves its change at 0. */
  async #loadOpens(listed: LiveQuote[]): Promise<void> {
    const today = new Date().toDateString();
    if (today !== this.#openDay) {
      this.#opens.clear();
      this.#openDay = today;
    }
    const missing = listed.filter((q) => !this.#opens.has(q.instrumentId));
    const opens = await Promise.allSettled(missing.map((q) => this.client.dayOpen(q.instrumentId)));
    opens.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        this.#opens.set(missing[i].instrumentId, result.value);
      }
    });
  }

  #scheduleQuotes(): void {
    clearTimeout(this.#quoteTimer);
    if (!this.running) {
      return;
    }
    this.#quoteTimer = setTimeout(async () => {
      await this.refreshQuotes();
      this.#scheduleQuotes();
    }, QUOTE_REFRESH_MS);
  }

  #scheduleStatus(): void {
    clearTimeout(this.#statusTimer);
    if (!this.running) {
      return;
    }
    this.#statusTimer = setTimeout(async () => {
      await this.refreshStatus();
      this.#scheduleStatus();
    }, MARKET_STATUS_REFRESH_MS);
  }

  #release(): void {
    this.#users = Math.max(0, this.#users - 1);
    if (this.#users === 0) {
      this.#halt();
    }
  }

  /** Stops every timer and listener; on sign-out also forgets the prices shown. */
  #halt(): void {
    this.#users = 0;
    clearTimeout(this.#quoteTimer);
    clearTimeout(this.#statusTimer);
    globalThis.document?.removeEventListener('visibilitychange', this.#onVisibility);
    if (!this.client.signedIn) {
      this.quotes.set([]);
      this.status.set(null);
    }
  }
}

/** Which way a price moved; null for the first price or no change. */
function moveOf(previous: number, next: number): LiveQuote['direction'] {
  if (previous <= 0 || next === previous) {
    return null;
  }
  return next > previous ? 'up' : 'down';
}
