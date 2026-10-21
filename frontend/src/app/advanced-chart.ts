import { Component, computed, effect, input, signal, untracked, OnDestroy } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import type { AdvancedDashboard } from './advanced-dashboard';
import { centralTime } from './app-time';
import { priceY, priceRange, pricePath, priceLabels, plotMarks } from './trade-marks';
import { Candle, movingAverage } from './stock-indicators';

@Component({
  selector: 'app-advanced-chart',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './advanced-chart.html',
  styleUrl: './advanced-chart.scss',
})
export class AdvancedChart implements OnDestroy {
  readonly desk = input.required<AdvancedDashboard>();
  readonly mode = signal<'Line' | 'Candles' | 'OHLC bars'>('Line');
  readonly modes = ['Line', 'Candles', 'OHLC bars'] as const;
  readonly interval = signal('5m');
  readonly intervals = ['1m', '5m', '15m', '1h', '1d'];
  readonly sma = signal(false);
  readonly ema = signal(false);
  readonly smaPeriod = signal(20);
  readonly emaPeriod = signal(50);
  readonly bars = signal<Candle[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly needsBars = computed(() => this.mode() !== 'Line' || this.sma() || this.ema());
  readonly smaPoints = computed(() => this.sma() ? movingAverage(this.bars(), this.smaPeriod(), 'SMA') : []);
  readonly emaPoints = computed(() => this.ema() ? movingAverage(this.bars(), this.emaPeriod(), 'EMA') : []);
  readonly visibleBars = computed(() => {
    const w = this.desk().chartWindow();
    return this.bars().filter(b => b.at >= w.start && b.at <= w.end);
  });
  readonly linePoints = computed(() => this.needsBars() ? this.visibleBars().map(b => ({ at: b.at, price: b.close })) : this.desk().visibleHistory());
  readonly range = computed(() => priceRange([
    ...(this.mode() === 'Line' ? this.linePoints().map(p => p.price) : this.visibleBars().flatMap(b => [b.low, b.high])),
    ...this.smaPoints().map(p => p.price), ...this.emaPoints().map(p => p.price),
    ...this.desk().tradeMarks().map(m => m.price), this.desk().selected().price, this.desk().averageCost() ?? 0,
  ]));
  readonly axis = computed(() => this.range() ? priceLabels(this.range()!) : []);
  readonly averageY = computed(() => this.range() && this.desk().averageCost() !== null ? priceY(this.desk().averageCost()!, this.range()!, 160) : null);
  readonly trades = computed(() => this.range() ? plotMarks(this.desk().tradeMarks(), this.desk().chartWindow(), this.range()!, 824, 160) : []);
  line(points: readonly { at: number; price: number }[]): string {
    return this.range() ? pricePath(points, this.desk().chartWindow(), this.range()!, 824, 160) : '';
  }
  readonly glyphs = computed(() => {
    const w = this.desk().chartWindow(), range = this.range();
    if (!range) return [];
    const ms: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '1d': 86400000 };
    const width = Math.max(1, Math.min(12, ms[this.interval()] / Math.max(1, w.end - w.start) * 824 * .7));
    return this.visibleBars().map(b => ({ ...b, x: (b.at - w.start) / Math.max(1, w.end - w.start) * 824,
      openY: priceY(b.open, range, 160), closeY: priceY(b.close, range, 160), highY: priceY(b.high, range, 160), lowY: priceY(b.low, range, 160), width,
      top: priceY(Math.max(b.open, b.close), range, 160), height: Math.max(.6, Math.abs(priceY(b.open, range, 160) - priceY(b.close, range, 160))) }));
  });
  #request = 0;
  #timer?: ReturnType<typeof setTimeout>;
  #destroyed = false;
  readonly barKey = computed(() => [this.desk().selected().instrumentId, this.interval(), this.desk().period(), this.needsBars()].join('|'));
  constructor() {
    effect(() => {
      const [id, interval, , needed] = this.barKey().split('|');
      untracked(() => {
        ++this.#request; clearTimeout(this.#timer); this.bars.set([]); this.error.set(''); this.clearCursor();
        if (id && needed === 'true') void this.loadBars(id, interval); else this.loading.set(false);
      });
    });
  }
  async loadBars(id = this.desk().selected().instrumentId, interval = this.interval()): Promise<void> {
    const request = ++this.#request;
    clearTimeout(this.#timer); this.loading.set(true);
    try {
      const bars = await this.desk().feed.client.candles(id, interval, 500);
      if (request !== this.#request || this.#destroyed) return;
      this.bars.set(bars); this.error.set('');
    } catch {
      if (request === this.#request && !this.#destroyed) this.error.set('Candle data could not be refreshed. Displayed bars may be out of date.');
    } finally {
      if (request === this.#request && !this.#destroyed) {
        this.loading.set(false); this.#timer = setTimeout(() => void this.loadBars(id, interval), 5000);
      }
    }
  }
  ngOnDestroy(): void { this.#destroyed = true; ++this.#request; clearTimeout(this.#timer); }
  readonly cursor = signal<{ at: number; price: number; symbol: string; period: string } | null>(null);
  readonly points = computed(() => {
    const window = this.desk().chartWindow();
    return (this.mode() === 'Line' && !this.needsBars() ? this.desk().priceHistory() : this.bars().map(b => ({ at: b.at, price: b.close }))).filter(p => p.at >= window.start && p.at <= window.end);
  });
  readonly active = computed(() => {
    const cursor = this.cursor(), desk = this.desk(), range = this.range();
    if (!cursor || !range || cursor.symbol !== desk.selected().symbol || cursor.period !== desk.period()) return null;
    const point = this.points().find(p => p.at === cursor.at && p.price === cursor.price);
    if (!point) return null;
    const window = desk.chartWindow();
    return { ...point, x: (point.at - window.start) / Math.max(1, window.end - window.start) * 824,
      y: priceY(point.price, range, 160),
      time: centralTime(point.at, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) + ' CT' };
  });
  readonly activeBar = computed(() => this.mode() === 'Line' ? null : this.bars().find(b => b.at === this.active()?.at) ?? null);
  clearCursor(): void { this.cursor.set(null); }
  selectPoint(index: number): void {
    const point = this.points()[index];
    if (point) this.cursor.set({ at: point.at, price: point.price, symbol: this.desk().selected().symbol, period: this.desk().period() });
  }
  scrub(event: PointerEvent): void {
    const box = (event.currentTarget as SVGElement).getBoundingClientRect();
    const points = this.points();
    if (!box.width || !points.length) return;
    const window = this.desk().chartWindow();
    const at = window.start + Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (window.end - window.start);
    let nearest = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].at - at) < Math.abs(points[nearest].at - at)) nearest = i;
    this.selectPoint(nearest);
  }
  scrubKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') { this.clearCursor(); return; }
    const last = this.points().length - 1;
    if (last < 0) return;
    const found = this.points().findIndex(p => p.at === this.active()?.at && p.price === this.active()?.price);
    const current = found < 0 ? last : found;
    const moves: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last };
    if (event.key in moves) { event.preventDefault(); this.selectPoint(Math.max(0, Math.min(last, moves[event.key]))); }
  }
}
