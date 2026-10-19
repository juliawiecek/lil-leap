import { Component, OnDestroy, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { LIVE_REPORTS, type ReportSummary } from '../../live-reports';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { KpiTile } from '../../shared/kpi-tile';
import { PageHeading } from '../../shared/page-heading';

/** Analyst home page: live totals from the reporting replica (TS-18.4; trends follow in TS-18.5). */
@Component({
  selector: 'app-insights-page',
  imports: [DashboardIcon, KpiTile, PageHeading],
  providers: [CurrencyPipe, DecimalPipe],
  templateUrl: './insights-page.html',
  styleUrl: './insights-page.scss',
})
export class InsightsPage implements OnDestroy {
  private readonly reports = inject(LIVE_REPORTS, { optional: true });
  private readonly currency = inject(CurrencyPipe);
  private readonly decimal = inject(DecimalPipe);
  readonly summary = signal<ReportSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private destroyed = false;

  constructor() {
    void this.refresh();
  }

  /** Loads the totals once when the page opens. */
  async refresh(): Promise<void> {
    if (!this.reports || this.loading() || this.destroyed) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const summary = await this.reports.load();
      if (!this.destroyed) {
        this.summary.set(summary);
      }
    } catch {
      if (!this.destroyed) {
        this.error.set('Could not load the reporting summary. Reload the page to try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  count(value: number | undefined): string {
    return value === undefined ? '–' : (this.decimal.transform(value) ?? '–');
  }
  money(value: number | string | undefined): string {
    return value === undefined ? '–' : (this.currency.transform(value) ?? '–');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
