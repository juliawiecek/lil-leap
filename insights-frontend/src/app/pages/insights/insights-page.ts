import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { LIVE_REPORTS, type ActivityPoint, type ReportSummary, type TopInstrument } from '../../live-reports';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { InsightsChart } from '../../shared/insights-chart';
import { centralHour, centralTime, twelveHour } from '../../shared/app-time';

const COUNT = new Intl.NumberFormat('en-US');
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
  imports: [DashboardIcon, InsightsChart],
  templateUrl: './insights-page.html',
  styleUrls: ['./insights-page.scss', './insights-page.novice.scss'],
})
export class InsightsPage implements OnDestroy {
  private readonly reports = inject(LIVE_REPORTS, { optional: true });
  readonly summary = signal<ReportSummary | null>(null);
  readonly top = signal<TopInstrument[]>([]);
  readonly trend = signal<ActivityPoint[]>([]);
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
  /** "Good morning" / "Good afternoon" / "Good evening" by the Central clock shown in the top bar. */
  readonly greeting = signal(greetingFor(centralHour()));
  /** Running total of today's trades, hour by hour, for the line under the traded value. */
  readonly cumulativePoints = computed(() => {
    // Running total up to the current hour; later hours have not happened yet, so they are left off.
    const now = `${CENTRAL_HOUR.format(new Date())}:00`;
    const upToNow = this.trend().filter((point) => point.hour <= now);
    let total = 0;
    return (upToNow.length ? upToNow : this.trend()).map((point) => ({ label: twelveHour(point.hour), value: (total += point.tradeCount) }));
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
    const [summary, top, trend] = await Promise.allSettled([
      this.reports.load(),
      this.reports.topInstruments(),
      this.reports.activityTrend(),
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
    if ([summary, top, trend].some((result) => result.status === 'fulfilled')) {
      this.updatedAt.set(centralTime(new Date()));
    }
    if ([summary, top, trend].some((result) => result.status === 'rejected')) {
      this.error.set('Some reporting figures could not be loaded. Trying again in a few seconds.');
    }
    this.loading.set(false);
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
  if (hour < 12) {
    return 'Good morning';
  }
  return hour < 18 ? 'Good afternoon' : 'Good evening';
}
