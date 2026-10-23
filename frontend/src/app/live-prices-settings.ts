import { Component, inject } from '@angular/core';
import { LivePricesService, WATCH_THRESHOLDS } from './live-prices';
import { STOCK_NAMES } from './speech-text';

/**
 * Live prices card in Settings > Accessibility (PS-21): pause live updates, and Price watch,
 * which tells a screen reader when picked stocks move by at least the chosen amount.
 */
@Component({
  selector: 'app-live-prices-settings',
  template: `
    <section class="card" aria-labelledby="live-prices-title" data-scan-group="Live prices">
      <span class="card-text">
        <b id="live-prices-title">Live prices</b>
        <small>
          Prices refresh every few seconds and the ticker scrolls. Pause them while you read, or let Price watch tell your
          screen reader when a stock you pick moves, at most once every 10 seconds.
        </small>
      </span>
      <label class="check"
        ><input type="checkbox" [checked]="live.paused()" (change)="live.setPaused($any($event.target).checked)" />
        Pause live updates</label
      >
      <fieldset class="watch">
        <legend>Price watch</legend>
        <div class="card-options">
          <label class="check"
            ><input
              type="checkbox"
              [checked]="live.settings().watch.enabled"
              (change)="live.updateWatch({ enabled: $any($event.target).checked })"
            />
            Tell my screen reader when a watched stock moves</label
          >
          <label
            >Move of at least
            <select (change)="live.updateWatch({ threshold: +$any($event.target).value })">
              @for (t of thresholds; track t.value) {
                <option [value]="t.value" [selected]="t.value === live.settings().watch.threshold">{{ t.label }}</option>
              }
            </select></label
          >
        </div>
        <fieldset class="stocks">
          <legend>Stocks to watch <span class="count">({{ live.settings().watch.symbols.length }} chosen)</span></legend>
          <div class="stock-grid">
            @for (s of stocks; track s.symbol) {
              <label class="check stock"
                ><input type="checkbox" [checked]="live.settings().watch.symbols.includes(s.symbol)" (change)="live.toggleWatched(s.symbol)" />
                <span><b>{{ s.symbol }}</b> {{ s.name }}</span></label
              >
            }
          </div>
        </fieldset>
      </fieldset>
    </section>
  `,
  styles: [
    `
      .card { display: grid; gap: 14px; padding: 14px 20px; border: 1px solid var(--surface-tone-04); border-radius: 8px; background: var(--surface-tone-03); }
      .card-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .card-text b { font-size: 14px; font-weight: 600; }
      .card-text small { max-width: 56ch; color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
      fieldset { min-width: 0; margin: 0; padding: 10px 12px 12px; border: 1px solid var(--surface-tone-04); border-radius: 8px; }
      legend { padding: 0 4px; color: var(--text); font-size: 13px; font-weight: 600; }
      .count { color: var(--text-muted); font-weight: 400; }
      .watch { display: grid; gap: 12px; }
      .card-options { display: flex; flex-wrap: wrap; align-items: end; gap: 14px; }
      label { display: grid; gap: 4px; color: var(--text-muted); font-size: 12px; }
      select { min-height: 32px; padding: 0 8px; border: 1px solid var(--surface-tone-02); border-radius: 8px; background: var(--background);
        color: var(--text); font: inherit; }
      label.check { display: flex; align-items: center; gap: 8px; min-height: 32px; color: var(--text); font-size: 13px; }
      label.check input { flex: none; width: 18px; height: 18px; margin: 0; accent-color: var(--accent); }
      .stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 2px 12px; max-height: 220px; overflow-y: auto; }
      .stock span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .stock b { font-weight: 700; }
      select:focus-visible, label.check input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
      @media (max-width: 480px) { .card { padding-inline: 12px; } }
    `,
  ],
})
export class LivePricesSettingsCard {
  readonly live = inject(LivePricesService);
  readonly thresholds = WATCH_THRESHOLDS;
  /** Every listed stock, by symbol, with the name people say. */
  readonly stocks = Object.entries(STOCK_NAMES)
    // "A M D" is how AMD is said, not how it is written; such names are left out on screen.
    .map(([symbol, name]) => ({ symbol, name: name.replaceAll(' ', '') === symbol ? '' : name }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
