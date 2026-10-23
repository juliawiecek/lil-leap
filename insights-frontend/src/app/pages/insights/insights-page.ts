import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { LIVE_REPORTS, type ActivityPoint, type OrdersToday, type PlacedOrder, type ReportSummary, type TopInstrument } from '../../live-reports';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { InsightsChartAccess } from '../../shared/insights-chart-access';
import { InsightsChart, type ChartPoint } from '../../shared/insights-chart';
import { centralClockSeconds, centralHour, centralTime, twelveHour } from '../../shared/app-time';

const COUNT = new Intl.NumberFormat('en-US');
const HOUR_MS = 3_600_000;
/** How often the page re-reads today's figures, in milliseconds. */
const REFRESH_MS = 5_000;
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
/** The hour it is now in Central time, as the trend labels it ("14:00"). */
const CENTRAL_HOUR = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Chicago' });
/** One colour per ranked stock (rank 1 to 6), used on its bar, its swatch and its slice of the ring. */
const RANK_COLORS = ['#94c973', '#6f9fc2', '#d4b06a', '#a98fc9', '#d08a72', '#5fb3a3'];
/** Formats the server's yyyy-mm-dd trading day without shifting it into the browser's time zone. */
const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Home page: today's totals, trades by hour and the most traded stocks for today (Central time). */
@Component({
  selector: 'app-insights-page',
  imports: [DashboardIcon, InsightsChart, InsightsChartAccess],
  templateUrl: './insights-page.html',
  styleUrl: './insights-page.scss',
})
export class InsightsPage implements OnDestroy {
  private readonly reports = inject(LIVE_REPORTS, { optional: true });
  readonly summary = signal<ReportSummary | null>(null);
  readonly top = signal<TopInstrument[]>([]);
  readonly trend = signal<ActivityPoint[]>([]);
  /** Today's orders with the exact time each was placed. */
  readonly orders = signal<OrdersToday | null>(null);
  /** The time of the last refresh; the order line runs level up to it. */
  readonly now = signal(Date.now());
  readonly loading = signal(false);
  readonly error = signal('');
  /** Hourly points for the shared chart. */
  readonly trendPoints = computed(() => this.trend().map((point) => ({ label: point.hour, value: point.tradeCount })));
  readonly tradesToday = computed(() => this.trend().reduce((sum, point) => sum + point.tradeCount, 0));
  /** Trades in the current Central hour, shown beside the headline. */
  readonly thisHour = computed(() => {
    const now = `${CENTRAL_HOUR.format(new Date())}:00`;
    return this.trend().find((point) => point.hour === now)?.tradeCount ?? 0;
  });
  /** When the figures were last read successfully, e.g. "4:02 PM CT"; empty until the first read. */
  readonly updatedAt = signal('');
  /** Names the day the figures cover, once the server has said which day that is. */
  readonly subtitle = computed(() => {
    const day = this.summary()?.date;
    const date = day ? DAY.format(new Date(`${day}T12:00:00Z`)) : '';
    return `Today's trading across every account${date ? `, ${date}` : ''} (Central time).`;
  });
  /** The busiest stock's trade count, so each row's bar is drawn relative to it. */
  readonly topMax = computed(() => Math.max(1, ...this.top().map((row) => row.tradeCount)));
  /** "Good Morning" / "Good Afternoon" / "Good Evening" by the Central clock shown in the top bar. */
  readonly greeting = signal(greetingFor(centralHour()));
  /**
   * Running count of today's orders: level from midnight, one step up at the exact second each order was placed,
   * then level again up to now. Hovering a step names the order.
   */
  readonly orderPoints = computed<ChartPoint[]>(() => {
    const day = this.orders();
    if (!day?.orders.length) {
      return [];
    }
    let total = 0;
    const steps = day.orders.map((order) => ({
      at: Date.parse(order.placedAt), label: centralClockSeconds(order.placedAt), value: ++total, note: this.describeOrder(order),
    }));
    const end = Math.max(this.now(), steps.at(-1)!.at);
    return [
      { at: Date.parse(day.dayStart), label: 'Midnight', value: 0 },
      ...steps,
      { at: end, label: `Now, ${centralClockSeconds(new Date(end))}`, value: total },
    ];
  });
  /** Hour labels under the order line: every hour early in the day, then every 2, 3 or 6 hours. */
  readonly orderTicks = computed(() => {
    const points = this.orderPoints();
    if (!points.length) {
      return [];
    }
    const start = points[0].at!;
    const end = points.at(-1)!.at!;
    const every = [1, 2, 3, 6].find((hours) => (end - start) / HOUR_MS / hours <= 5) ?? 6;
    const ticks: { at: number; label: string }[] = [];
    for (let at = start; at <= end; at += every * HOUR_MS) {
      ticks.push({ at, label: twelveHour(`${String(centralHour(new Date(at))).padStart(2, '0')}:00`) });
    }
    return ticks;
  });
  /** The traded value split so its cents can be set lighter than the dollars. */
  readonly valueParts = computed(() => {
    const text = this.money(this.summary()?.gross_executed_value);
    return text.includes('.') ? { whole: text.slice(0, -3), cents: text.slice(-3) } : { whole: text, cents: '' };
  });
  readonly fillRatio = computed(() => {
    const s = this.summary();
    return s && s.orders ? Math.min(100, (s.fills / s.orders) * 100) : 0;
  });
  readonly fillRate = computed(() => (this.summary()?.orders ? `${this.fillRatio().toFixed(1)}%` : '–'));
  readonly averageFill = computed(() => {
    const s = this.summary();
    return s && s.fills ? MONEY.format(Number(s.gross_executed_value) / s.fills) : '–';
  });
  /** Each hour's bar, sized against the busiest hour; the current New York hour is marked. */
  readonly bars = computed(() => {
    const max = Math.max(1, ...this.trend().map((point) => point.tradeCount));
    const now = `${CENTRAL_HOUR.format(new Date())}:00`;
    return this.trend().map((point, i) => ({
      hour: point.hour, label: twelveHour(point.hour), count: point.tradeCount, height: (point.tradeCount / max) * 100, now: point.hour === now, labelled: i % 3 === 0,
    }));
  });
  readonly busiest = computed(() =>
    this.trend().reduce<ActivityPoint | null>((best, point) => (!best || point.tradeCount > best.tradeCount ? point : best), null),
  );
  readonly busiestHour = computed(() => (this.busiest() ? twelveHour(this.busiest()!.hour) : ''));
  /** The top stocks with their colour and share of all of today's trades. */
  readonly ranked = computed(() => {
    const total = Math.max(1, this.tradesToday(), ...this.top().map((row) => row.tradeCount));
    return this.top().map((row, i) => ({ ...row, color: RANK_COLORS[i] ?? '#4a5048', share: (row.tradeCount / total) * 100 }));
  });
  /** The ring's slices: the top six stocks' shares, laid end to end around a circle of length 100. */
  readonly arcs = computed(() => {
    let start = 0;
    return this.ranked().slice(0, RANK_COLORS.length).map((row) => {
      const length = Math.max(0, Math.min(row.share, 100 - start) - 0.8);
      const arc = { color: row.color, dash: `${length.toFixed(2)} ${(100 - length).toFixed(2)}`, offset: (-start).toFixed(2) };
      start += Math.min(row.share, 100 - start);
      return arc;
    });
  });
  readonly topShare = computed(() => Math.round(Math.min(100, this.ranked().slice(0, RANK_COLORS.length).reduce((sum, row) => sum + row.share, 0))));
  readonly topDescription = computed(() => {
    const rows = this.ranked();
    if (!rows.length) { return this.loading() ? 'Most traded stocks. Reports are loading.' : this.error() ? 'The stock ranking is unavailable because reports could not be loaded.' : 'Most traded stocks today. No trades are recorded yet.'; }
    const busiest = rows.reduce((a, b) => b.tradeCount > a.tradeCount ? b : a);
    return `Most traded stocks today. ${rows.length} stocks are shown. ${busiest.instrument} has the most trades, ${COUNT.format(busiest.tradeCount)}. `
      + rows.map(row => `${row.instrument}: ${COUNT.format(row.tradeCount)} ${this.plural(row.tradeCount, 'trade')}, ${row.share.toFixed(1)} percent of today's trades`).join('; ') + '.';
  });
  readonly topTable = computed(() => ({
    columns: ['Rank', 'Stock', 'Trades', "Share of today's trades"],
    rows: this.ranked().map((row, i) => [String(i + 1), row.instrument, COUNT.format(row.tradeCount), `${row.share.toFixed(1)}%`]),
  }));
  readonly hourlyDescription = computed(() => 'Trades per hour today, Central time. '
    + this.bars().map(bar => `${bar.label}: ${COUNT.format(bar.count)} ${this.plural(bar.count, 'trade')}`).join('; ') + '.');
  readonly hourlyTable = computed(() => ({ columns: ['Hour (Central)', 'Trades'],
    rows: this.bars().map(bar => [bar.label, COUNT.format(bar.count)]) }));
  private destroyed = false;
  private readonly poll: ReturnType<typeof setInterval>;

  constructor() {
    void this.refresh();
    // Re-read the figures every few seconds so new trades show up without a reload; skipped while the tab is hidden.
    this.poll = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        void this.refresh();
      }
    }, REFRESH_MS);
    // In Node test runs, a pending timer must not keep the process alive.
    (this.poll as { unref?: () => void }).unref?.();
  }

  /** Loads the totals, today's activity and the top stocks; runs when the page opens and every REFRESH_MS. */
  async refresh(): Promise<void> {
    if (!this.reports || this.loading() || this.destroyed) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const [summary, top, trend, orders] = await Promise.allSettled([
      this.reports.load(),
      this.reports.topInstruments(),
      this.reports.activityTrend(),
      this.reports.ordersToday(),
    ]);
    if (this.destroyed) {
      return;
    }
    // A page left open keeps its greeting in step with the clock.
    this.greeting.set(greetingFor(centralHour()));
    if (summary.status === 'fulfilled') {
      this.summary.set(summary.value);
    }
    if (top.status === 'fulfilled') {
      this.top.set(top.value);
    }
    if (trend.status === 'fulfilled') {
      this.trend.set(trend.value);
    }
    if (orders.status === 'fulfilled') {
      this.orders.set(orders.value);
    }
    this.now.set(Date.now());
    if ([summary, top, trend, orders].some((result) => result.status === 'fulfilled')) {
      this.updatedAt.set(centralTime(new Date()));
    }
    if ([summary, top, trend, orders].some((result) => result.status === 'rejected')) {
      this.error.set('Some reporting figures could not be loaded. Trying again in a few seconds.');
    }
    this.loading.set(false);
  }

  /** "Buy 3 MSFT · $1,524.46" for a filled order; "Sell 5 AAPL · Cancelled" for one that never filled. */
  describeOrder(order: PlacedOrder): string {
    const side = order.side.charAt(0) + order.side.slice(1).toLowerCase();
    const status = order.status.charAt(0) + order.status.slice(1).toLowerCase().replace(/_/g, ' ');
    const filled = Number(order.filledValue) > 0 ? this.money(order.filledValue) : '';
    const outcome = order.status === 'FILLED' ? filled : [filled, status].filter(Boolean).join(' · ');
    return `${side} ${this.count(order.quantity)} ${order.symbol} · ${outcome}`;
  }

  /** "fill" or "fills" to match a count. */
  plural(value: number | undefined, word: string): string {
    return Number(value) === 1 ? word : `${word}s`;
  }
  count(value: number | undefined): string {
    return value === undefined ? '–' : COUNT.format(value);
  }
  money(value: number | string | undefined): string {
    return value === undefined ? '–' : MONEY.format(Number(value));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearInterval(this.poll);
  }
}

/** The greeting for an hour on the Central clock, 0 to 23. */
export function greetingFor(hour: number): string {
  return hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
}
