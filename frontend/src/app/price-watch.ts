import { Component, OnDestroy, inject, signal } from '@angular/core';
import { MarketFeed } from './market-feed.service';
import { LivePricesService, PriceWatcher } from './live-prices';
import { ANNOUNCE_DELAY_MS } from './live-announcer';

/**
 * Price watch's live region (PS-21): one polite region, rate-limited and grouped, that tells
 * screen reader users when a stock they picked in Settings moves past their threshold. The
 * ticker itself is not a live region, so prices never chatter on their own.
 */
@Component({
  selector: 'app-price-watch',
  template: `<div class="sr-only" aria-live="polite" aria-atomic="true" data-price-watch>{{ message() }}</div>`,
})
export class PriceWatch implements OnDestroy {
  readonly feed = inject(MarketFeed);
  readonly live = inject(LivePricesService, { optional: true }) ?? new LivePricesService();
  /** The last Price watch message, as screen readers read it. */
  readonly message = signal('');
  readonly #watcher = new PriceWatcher();
  readonly #stop = this.feed.onUpdate(() => this.check());
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** Looks at the latest prices and announces any alerts that are due. */
  check(now = Date.now()): void {
    const text = this.#watcher.update(this.feed.quotes(), this.live.settings().watch, now);
    if (!text) {
      return;
    }
    // Emptied first, so a message with the same words as the last one is still read.
    this.message.set('');
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.message.set(text), ANNOUNCE_DELAY_MS);
  }

  ngOnDestroy(): void {
    this.#stop();
    clearTimeout(this.#timer);
  }
}
