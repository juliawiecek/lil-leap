import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { LIVE_REPORTS, type ActivityPoint, type ReportSummary, type TopInstrument } from '../../live-reports';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { InsightsChart } from '../../shared/insights-chart';
import { KpiTile } from '../../shared/kpi-tile';
import { PageHeading } from '../../shared/page-heading';

const COUNT = new Intl.NumberFormat('en-US');
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
/** Formats the server's yyyy-mm-dd trading day without shifting it into the browser's time zone. */
const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Home page: today's totals, trades by hour and the most traded stocks for the New York trading day. */
@Component({
  selector: 'app-insights-page',
  imports: [DashboardIcon, InsightsChart, KpiTile, PageHeading],
  templateUrl: './insights-page.html',
  styleUrl: './insights-page.scss',
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
  /** Names the day the figures cover, once the server has said which day that is. */
  readonly subtitle = computed(() => {
    const day = this.summary()?.date;
    const date = day ? DAY.format(new Date(`${day}T12:00:00Z`)) : '';
    return `Today's trading across every account${date ? `, ${date}` : ''} (New York time).`;
  });
  /** The busiest stock's trade count, so each row's bar is drawn relative to it. */
  readonly topMax = computed(() => Math.max(1, ...this.top().map((row) => row.tradeCount)));
  private destroyed = false;

  constructor() {
    void this.refresh();
  }

  /** Loads the totals, today's activity and the top stocks once when the page opens. */
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
    if (summary.status === 'fulfilled') {
      this.summary.set(summary.value);
    }
    if (top.status === 'fulfilled') {
      this.top.set(top.value);
    }
    if (trend.status === 'fulfilled') {
      this.trend.set(trend.value);
    }
    if ([summary, top, trend].some((result) => result.status === 'rejected')) {
      this.error.set('Some reporting figures could not be loaded. Reload the page to try again.');
    }
    this.loading.set(false);
  }

  count(value: number | undefined): string {
    return value === undefined ? '–' : COUNT.format(value);
  }
  money(value: number | string | undefined): string {
    return value === undefined ? '–' : MONEY.format(Number(value));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
