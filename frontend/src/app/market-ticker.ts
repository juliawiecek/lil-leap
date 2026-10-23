import { PriceFlash } from './price-flash';
import { FinancialChange, describeChange } from './financial-change';
import { Component, OnDestroy, computed, inject, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MarketFeed } from './market-feed.service';
import { isDelayed } from './market-feed-api';
import { marketBadgeText } from './market-status-api';
import { spokenCompany } from './briefing';
import { spokenQuote } from './speech-text';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Live ticker strip for both dashboards (TS-14.7 AC2, PS-02): the market's open/closed badge and
 * every listed stock's price and change, flashing green or red on each move.
 */
@Component({
  selector: 'app-market-ticker',
  imports: [FinancialChange, PriceFlash, CurrencyPipe],
  template: `
    <div class="ticker" aria-label="Live prices" aria-live="off">
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
              [attr.aria-label]="spoken(quote)"
              [attr.data-speak]="spokenWords(quote)"
              (click)="pick.emit(quote.symbol)"
            >
              <strong>{{ quote.symbol }}</strong>
              @if (quote.price) {
                <app-price-flash [direction]="quote.direction"><span class="price">{{ quote.price | currency }}</span></app-price-flash>
                <span class="change" [class.up]="quote.change > 0" [class.down]="quote.change < 0">
                  <app-financial-change [value]="quote.change" unit="percent" />
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
                <app-price-flash [direction]="quote.direction"><span class="price">{{ quote.price | currency }}</span></app-price-flash>
                <span class="change" [class.up]="quote.change > 0" [class.down]="quote.change < 0">
                  <app-financial-change [value]="quote.change" unit="percent" />
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
        -webkit-mask-image: linear-gradient(90deg, transparent, var(--mask-ink) 3%, var(--mask-ink) 95%, transparent); mask-image: linear-gradient(90deg, transparent, var(--mask-ink) 3%, var(--mask-ink) 95%, transparent); }
      .tape { display: flex; width: max-content; }
      .tape ul { padding-right: 4px; }
      .tape.moving { animation-name: tape-scroll; animation-timing-function: linear; animation-iteration-count: infinite; }
      .tape-window:hover .tape, .tape-window:focus-within .tape { animation-play-state: paused; }
      @keyframes tape-scroll { to { transform: translateX(-50%); } }
      .badge { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; padding: 4px 10px 4px 0; border-radius: 999px;
        background: transparent; color: var(--gain); font-weight: 700; white-space: nowrap; }
      .badge i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: live 2.4s ease-out infinite; }
      @keyframes live { 0% { box-shadow: 0 0 0 0 var(--gain-wash-09); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
      .badge.closed { color: var(--loss); }
      .badge.closed i { animation: none; }
      ul { display: flex; gap: 4px; margin: 0; padding: 0; list-style: none; }
      button { display: flex; align-items: baseline; gap: 8px; padding: 4px 10px; border: 0; border-radius: 999px; background: none;
        color: var(--text-muted); font: inherit; white-space: nowrap; cursor: pointer; transition: background-color .15s; }
      button strong { color: var(--text); font-weight: 700; }
      .change { font-weight: 600; }
      button:hover { background: var(--surface-raised); }
      .price { font-variant-numeric: tabular-nums; }
      .change.up { color: var(--green, var(--gain)); }
      .change.down { color: var(--loss); }
      .muted, .change { color: var(--muted, var(--text-muted)); }
      .delayed { padding: 0 5px; border-radius: 4px; background: var(--surface-tone-14); color: var(--warning); font-style: normal; font-size: 12px; }
      .flash-up { animation: flash-up 1.2s ease-out; }
      .flash-down { animation: flash-down 1.2s ease-out; }
      @keyframes flash-up { from { background: var(--gain-wash-20); } to { background: transparent; } }
      @keyframes flash-down { from { background: var(--loss-wash-08); } to { background: transparent; } }
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

  /**
   * The button's name: what it shows, in the same order ("AAPL, $224.52, +0.40%"), so people using
   * speech input can say what they see (WCAG 2.5.3, PS-20). Switch control still says the company
   * name, since everything it reads goes through speakable() ("Apple, $224.52, +0.40%").
   */
  spoken(quote: { symbol: string; name: string; price: number; change: number; quotedAt: string }): string {
    if (!quote.price) {
      return `${quote.symbol}, price not available yet`;
    }
    // The change as shown, without its arrow, which only repeats the sign.
    const change = describeChange(quote.change).visual.replace(/^[^\d+−]+/, '');
    const delayed = this.delayed(quote.quotedAt) ? ', Price delayed' : '';
    return `${quote.symbol}, ${USD.format(quote.price)}, ${change}${delayed}`;
  }

  /**
   * What voice mode and switch control say aloud (data-speak, PS-22): the company, the price
   * rounded to whole dollars and the move in words, "Apple, 225 dollars, up 0.4 percent. Select to
   * trade." Kept apart from the button's name above, which must match the screen.
   */
  spokenWords(quote: { symbol: string; name: string; price: number; change: number; quotedAt: string }): string {
    return spokenQuote(spokenCompany(quote.name, quote.symbol), quote.price, quote.change, this.delayed(quote.quotedAt));
  }

  ngOnDestroy(): void {
    this.#stop();
  }
}
