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
      <!-- The list is drawn twice so the tape can scroll in a seamless loop; the copy is hidden from assistive tech. -->
      <div class="tape-window">
        <div class="tape" [class.moving]="feed.quotes().length > 0" [style.animation-duration.s]="feed.quotes().length * 6">
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
          @if (feed.quotes().length) {
            <ul aria-hidden="true">
              @for (quote of feed.quotes(); track quote.symbol + '-copy-' + quote.version) {
                <li>
            <button
              type="button"
              tabindex="-1"
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
              }
            </ul>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .ticker { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0; font-size: 12.5px; }
      .tape-window { flex: 1; min-width: 0; overflow: hidden;
        -webkit-mask-image: linear-gradient(90deg, transparent, #000 3%, #000 95%, transparent); mask-image: linear-gradient(90deg, transparent, #000 3%, #000 95%, transparent); }
      .tape { display: flex; width: max-content; }
      .tape ul { padding-right: 4px; }
      .tape.moving { animation-name: tape-scroll; animation-timing-function: linear; animation-iteration-count: infinite; }
      .tape-window:hover .tape, .tape-window:focus-within .tape { animation-play-state: paused; }
      @keyframes tape-scroll { to { transform: translateX(-50%); } }
      .badge { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; padding: 4px 10px 4px 0; border-radius: 999px;
        background: transparent; color: var(--market-status-accent, #94c973); font-weight: 700; white-space: nowrap; }
      .badge i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: live 2.4s ease-out infinite; }
      @keyframes live { 0% { box-shadow: 0 0 0 0 var(--market-status-pulse, rgba(148, 201, 115, .55)); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
      .badge.closed { color: var(--market-status-accent, #e2b65a); }
      .badge.closed i { animation: none; }
      ul { display: flex; gap: 4px; margin: 0; padding: 0; list-style: none; }
      button { display: flex; align-items: baseline; gap: 8px; padding: 4px 10px; border: 0; border-radius: 999px; background: none;
        color: #a4a79e; font: inherit; white-space: nowrap; cursor: pointer; transition: background-color .15s; }
      button strong { color: #f2f0e9; font-weight: 700; }
      .change { font-weight: 600; }
      button:hover { background: #161616; }
      .price { font-variant-numeric: tabular-nums; }
      .change.up { color: var(--green, #94c973); }
      .change.down { color: #ff7a6e; }
      .muted, .change { color: var(--muted, #a4a79e); }
      .delayed { padding: 0 5px; border-radius: 4px; background: #211b0e; color: #e2b65a; font-style: normal; font-size: 12px; }
      .flash-up { animation: flash-up 1.2s ease-out; }
      .flash-down { animation: flash-down 1.2s ease-out; }
      @keyframes flash-up { from { background: rgba(148, 201, 115, .2); } to { background: transparent; } }
      @keyframes flash-down { from { background: rgba(255, 122, 110, .2); } to { background: transparent; } }
      @media (prefers-reduced-motion: reduce) { .flash-up, .flash-down, .badge i, .tape.moving { animation: none; } .tape-window { overflow-x: auto; scrollbar-width: none; } }
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
