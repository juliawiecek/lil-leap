import { Component, computed, inject, input, signal, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ApiHttpClient } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { MarketFeed } from './market-feed.service';
import { isDelayed } from './market-feed-api';
import { tradingClients } from './trading-clients';
import { AccountSummary } from './accounts-api';
import { PortfolioChart } from './portfolio-chart';
import { ChartPeriod, ChartRange, ValuePoint, PricePoint, barStep, chartRange, fundedAt, portfolioSeries, tradingSession } from './portfolio-history';

@Component({
  selector: 'app-advanced-portfolio',
  imports: [CurrencyPipe, DecimalPipe, PortfolioChart],
  template: `
    <section aria-label="Overall portfolio" class="portfolio-panel">
      <header><div><h2>Account value</h2><p>{{ account()?.account_name }} · Cash + all holdings</p></div>
        <button type="button" (click)="load()" [disabled]="loading() || !account()">Refresh portfolio chart</button>
      </header>
      @if (privateBalance()) { <p>Balances hidden</p> }
      @else {
        <strong class="value">{{ loaded() ? ((scrub()?.value ?? value()) | currency) : 'Loading balances…' }}</strong>
        @if (change(); as move) {
          <p class="change">Account value change: {{ move.amount | currency }}
            @if (move.percent !== null) { ({{ move.percent | number:'1.2-2' }}%) }
          </p>
        }
        <p class="note">Includes deposits, withdrawals and transfers. This is account value change, not investment return. Historical holdings use recorded quote midpoints; current holdings use bids.</p>
        <app-portfolio-chart [points]="points()" [range]="range()" [period]="period()" [loading]="loading()" [error]="error()" [delayed]="delayed()" (periodChange)="setPeriod($event)" (scrub)="scrub.set($event)" />
      }
    </section>
  `,
  styles: [`
    :host { display:block; margin-bottom:16px; min-width:0; }
    .portfolio-panel { padding:20px; border:1px solid #232323; border-radius:8px; background:#111; color:#ededed; }
    header { display:flex; justify-content:space-between; align-items:start; gap:16px; flex-wrap:wrap; }
    h2 { margin:0; font-size:16px; } p { margin:8px 0; } header p,.note { color:#a1a1a1; font-size:12px; line-height:1.5; }
    .value { display:block; margin-top:12px; font-size:28px; } .change { font-size:13px; }
    button { border:1px solid #333; border-radius:4px; padding:8px 12px; color:#ededed; background:#191919; cursor:pointer; }
    button:disabled { opacity:.5; cursor:default; }
    @media(max-width:600px) { .portfolio-panel { padding:12px; } }
  `],
})
export class AdvancedPortfolio implements OnChanges, OnDestroy {
  readonly account = input<AccountSummary | null>(null);
  readonly value = input(0);
  readonly loaded = input(false);
  readonly privateBalance = input(false);
  readonly feed = inject(MarketFeed);
  readonly clients = tradingClients(inject(AuthService), inject(ApiHttpClient));
  readonly period = signal<ChartPeriod>('1D');
  readonly history = signal<ValuePoint[]>([]);
  readonly live = signal<ValuePoint[]>([]);
  readonly range = signal<ChartRange | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly scrub = signal<ValuePoint | null>(null);
  readonly heldSymbols = signal<string[]>([]);
  readonly delayed = computed(() => this.heldSymbols().some(symbol => {
    const quote = this.feed.quotes().find(q => q.symbol === symbol);
    return !quote || isDelayed(quote.quotedAt, this.feed.now());
  }));
  readonly points = computed(() => {
    const history = this.history(), range = this.range();
    if (!history.length || !range) return history;
    const live = this.live().filter(p => p.at >= range.start && (!range.session || p.at <= range.session.close));
    return live.length ? [...history.filter(p => p.at < live[0].at), ...live] : history;
  });
  readonly change = computed(() => {
    const points = this.points();
    if (points.length < 2 || this.error()) return null;
    const start = points[0].value, amount = points.at(-1)!.value - start;
    return { amount, percent: start > 0 ? amount / start * 100 : null };
  });
  #request = 0;
  #accountId: string | undefined;
  #timer?: ReturnType<typeof setTimeout>;
  #destroyed = false;

  ngOnChanges(changes: SimpleChanges): void {
    const id = this.account()?.account_id;
    if (id !== this.#accountId) {
      this.#accountId = id;
      this.history.set([]); this.live.set([]); this.range.set(null); this.scrub.set(null); this.heldSymbols.set([]);
      void this.load();
    }
    if ((changes['value'] || changes['loaded']) && this.loaded() && id) {
      this.live.update(points => [...points.slice(-1999), { at: Date.now(), value: this.value() }]);
    }
  }
  setPeriod(period: ChartPeriod): void {
    this.period.set(period); this.scrub.set(null); this.history.set([]); void this.load();
  }
  async load(): Promise<void> {
    const request = ++this.#request;
    clearTimeout(this.#timer);
    const account = this.account();
    if (!account) { this.loading.set(false); return; }
    this.loading.set(true); this.error.set('');
    try {
      const filter = { accountId: account.account_id };
      const [movements, orders] = await Promise.all([this.clients.cashActivityClient.list(filter), this.clients.orderHistoryClient.list(filter)]);
      const fills = orders.filter(o => o.status === 'FILLED' && o.fillPrice !== null && o.filledAt).map(o => ({
        at: Date.parse(o.filledAt!), symbol: o.symbol, price: o.fillPrice!, quantity: (o.side.toUpperCase() === 'SELL' ? -1 : 1) * (o.filledQuantity ?? o.quantity),
      }));
      const cash = [...movements.filter(m => m.settlementStatus === 'SETTLED').map(m => ({ at: Date.parse(m.occurredAt), amount: m.amount })), ...fills.map(f => ({ at: f.at, amount: -f.quantity * f.price }))].filter(e => Number.isFinite(e.at));
      const now = Date.now(), period = this.period();
      const range = chartRange(period, now, fundedAt(account.created_at, cash), tradingSession(now, this.feed.status()?.exchangeTimeZone));
      // Candle requests are relative to server "now", even when 1D ends at a past session close.
      const { interval, limit } = barStep({ ...range, end: now });
      const symbols = [...new Set(fills.map(f => f.symbol))];
      const prices = new Map<string, PricePoint[]>();
      await Promise.all(symbols.map(async symbol => {
        const quote = this.feed.quotes().find(q => q.symbol === symbol);
        if (!quote) throw new Error('Missing instrument');
        const bars = (await this.feed.client.closes(quote.instrumentId, interval, limit, now)).filter(p => p.at <= range.end);
        if (!bars.length) throw new Error('Missing price history');
        prices.set(symbol, bars);
      }));
      if (request !== this.#request || this.#destroyed) return;
      this.heldSymbols.set(symbols.filter(symbol => fills.filter(f => f.symbol === symbol).reduce((sum, f) => sum + f.quantity, 0) > 0));
      this.range.set(range); this.history.set(portfolioSeries(range, cash, fills, prices));
    } catch {
      if (request === this.#request && !this.#destroyed) this.error.set('Portfolio history is unavailable. Use Refresh portfolio chart to retry.');
    } finally {
      if (request === this.#request && !this.#destroyed) {
        this.loading.set(false);
        this.#timer = setTimeout(() => void this.load(), 60000);
      }
    }
  }
  ngOnDestroy(): void { this.#destroyed = true; ++this.#request; clearTimeout(this.#timer); }
}
