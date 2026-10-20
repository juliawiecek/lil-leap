import { Component, OnDestroy, computed, inject, output } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MarketFeed } from './market-feed.service';
import { isDelayed } from './market-feed-api';
import { marketBadgeText } from './market-status-api';

/**
 * Live ticker strip for both dashboards (TS-14.7 AC2, PS-02): the market's open/closed badge and
 * every listed stock's price and change, flashing green or red on each move.
 */
@Component({
  selector: 'app-market-ticker',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <div class="ticker" aria-label="Live prices">
      <span class="badge" [class.closed]="!feed.status()?.open" role="status">
        <i aria-hidden="true"></i>{{ badge() }}
      </span>
      <ul>
        @for (quote of feed.quotes(); track quote.symbol + '-' + quote.version) {
          <li>
            <button
              type="button"
              [class.flash-up]="quote.direction === 'up'"
              [class.flash-down]="quote.direction === 'down'"
              (click)="pick.emit(quote.symbol)"
            >
              <strong>{{ quote.symbol }}</strong>
              @if (quote.price) {
                <span class="price">{{ quote.price | currency }}</span>
                <span class="change" [class.up]="quote.change > 0" [class.down]="quote.change < 0">
                  {{ quote.change > 0 ? '+' : '' }}{{ quote.change | number: '1.2-2' }}%
                </span>
                @if (delayed(quote.quotedAt)) {
                  <em class="delayed">Price delayed</em>
                }
              } @else {
                <span class="price muted">—</span>
              }
            </button>
          </li>
        } @empty {
          <li class="muted">Loading prices…</li>
        }
      </ul>
    </div>
  `,
  styles: [
    `
      :host { display: block; margin: 6px 0 12px; }
      .ticker { display: flex; align-items: center; gap: 14px; min-height: 38px; padding: 6px 12px; overflow-x: auto;
        scrollbar-width: none; border: 1px solid var(--line, #202e35); border-radius: 8px; background: #0f191d; font-size: 12px; }
      .badge { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; padding: 4px 10px; border-radius: 999px;
        background: #12301f; color: #8ee6a8; font-weight: 600; white-space: nowrap; }
      .badge i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .badge.closed { background: #2c2a1c; color: #f0c86a; }
      ul { display: flex; gap: 6px; margin: 0; padding: 0; list-style: none; }
      button { display: flex; align-items: baseline; gap: 7px; padding: 4px 9px; border: 0; border-radius: 6px; background: none;
        color: inherit; font: inherit; white-space: nowrap; cursor: pointer; }
      button:hover { background: #172630; }
      .price { font-variant-numeric: tabular-nums; }
      .change.up { color: var(--gain, var(--green, #51d88c)); }
      .change.down { color: var(--loss, #f08a8a); }
      .muted, .change { color: var(--muted, #aebaca); }
      .delayed { padding: 0 5px; border-radius: 4px; background: #3a3220; color: #f0c86a; font-style: normal; font-size: 10px; }
      .flash-up { animation: flash-up 1.2s ease-out; }
      .flash-down { animation: flash-down 1.2s ease-out; }
      @keyframes flash-up { from { background: var(--gain-flash, #1f5a37); } to { background: transparent; } }
      @keyframes flash-down { from { background: var(--loss-flash, #5a1f24); } to { background: transparent; } }
      @media (prefers-reduced-motion: reduce) { .flash-up, .flash-down { animation: none; } }
    `,
  ],
})
export class MarketTicker implements OnDestroy {
  readonly feed = inject(MarketFeed);
  /** A stock was clicked; dashboards open it. */
  readonly pick = output<string>();
  readonly badge = computed(() => marketBadgeText(this.feed.status(), new Date(this.feed.now())));
  readonly #stop = this.feed.start();

  delayed(quotedAt: string): boolean {
    return isDelayed(quotedAt, this.feed.now());
  }

  ngOnDestroy(): void {
    this.#stop();
  }
}
