import { Injectable, inject, signal } from '@angular/core';
import { ApiHttpClient } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { QUOTE_REFRESH_MS } from './portfolio-api';
import { MARKET_STATUS_REFRESH_MS, MarketStatus, MarketStatusClient } from './market-status-api';
import { LiveQuote, MarketFeedClient, PriceTick, changeFrom, unpriced } from './market-feed-api';

/**
 * One shared feed of live prices and market status for every view (TS-14.7, PS-02).
 *
 * Prices for every listed stock refresh every 5 s whether or not the client holds it, and market
 * status every 60 s. Polling pauses while the tab is hidden and refreshes immediately when it is
 * shown again; it stops when the last view releases it or the user signs out.
 */
@Injectable({ providedIn: 'root' })
export class MarketFeed {
  readonly #tokens = inject(AuthService, { optional: true }) ?? { accessToken: null };
  client = new MarketFeedClient(this.#tokens, inject(ApiHttpClient));
  statusClient = new MarketStatusClient(this.#tokens, inject(ApiHttpClient));

  readonly quotes = signal<LiveQuote[]>([]);
  readonly status = signal<MarketStatus | null>(null);
  /** Time of the last refresh, so "Price delayed" re-evaluates without its own timer. */
  readonly now = signal(Date.now());

  #users = 0;
  /** Refresh intervals the views using the feed asked for; prices refresh at the fastest of them. */
  readonly #rates: number[] = [];
  #quoteTimer: ReturnType<typeof setTimeout> | undefined;
  #statusTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #listeners = new Set<() => void>();
  readonly #onVisibility = (): void => {
    if (!this.hidden) {
      void this.refreshQuotes();
      void this.refreshStatus();
    }
  };

  /**
   * Starts the feed for a view; call the returned function when the view goes away. A view can ask
   * for faster prices (e.g. the novice overview chart every 3 seconds); the feed uses the fastest asked for.
   */
  start(refreshMs: number = QUOTE_REFRESH_MS): () => void {
    const fasterThanBefore = this.#users > 0 && refreshMs < this.#refreshMs();
    this.#rates.push(refreshMs);
    this.#users += 1;
    if (fasterThanBefore) {
      this.#scheduleQuotes();
    }
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
        this.#rates.splice(this.#rates.indexOf(refreshMs), 1);
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

  /**
   * Loads the stock list if needed, then every stock's latest price in one request (PS-10).
   * A stock without a new quote, or a failed request, keeps the last price shown.
   */
  async refreshQuotes(): Promise<void> {
    if (!this.#canPoll()) {
      return;
    }
    if (!this.quotes().length) {
      await this.#loadInstruments();
    }
    const listed = this.quotes();
    const opens = await this.#loadOpens(listed);
    let ticks = new Map<string, PriceTick>();
    try {
      ticks = await this.client.latestMany(listed.map((q) => q.instrumentId));
    } catch {
      // Keep the last prices; the next tick retries.
    }
    if (!this.running) {
      return;
    }
    this.now.set(Date.now());
    this.quotes.set(
      listed.map((quote) => {
        const latest = ticks.get(quote.instrumentId);
        if (!latest) {
          return { ...quote, change: changeFrom(opens.get(quote.instrumentId), quote.price), direction: null };
        }
        const { price, bid, ask, quotedAt } = latest;
        const direction = moveOf(quote.price, price);
        return {
          ...quote,
          price,
          bid,
          ask,
          quotedAt,
          change: changeFrom(opens.get(quote.instrumentId), price),
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

  /**
   * Re-read baselines in one batch so a tab left open crosses 09:30 correctly and
   * retries until the first session quote arrives. A failure leaves change unknown (0).
   */
  async #loadOpens(listed: LiveQuote[]): Promise<Map<string, number>> {
    try {
      return await this.client.dayOpens(listed.map((q) => q.instrumentId));
    } catch {
      return new Map();
    }
  }

  #scheduleQuotes(): void {
    clearTimeout(this.#quoteTimer);
    if (!this.running) {
      return;
    }
    this.#quoteTimer = setTimeout(async () => {
      await this.refreshQuotes();
      this.#scheduleQuotes();
    }, this.#refreshMs());
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

  /** The fastest refresh any current view asked for. */
  #refreshMs(): number {
    return this.#rates.length ? Math.min(...this.#rates) : QUOTE_REFRESH_MS;
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
