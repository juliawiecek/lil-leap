import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, KeyValuePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TRADE_TRAIL, type TradeTrailResponse } from '../../trade-trail';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { PageHeading } from '../../shared/page-heading';
import { tradeCase } from './trade-case';

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plain names for where each step was recorded. */
const SOURCES: Record<string, string> = {
  STATUS: 'Status change',
  AUDIT: 'Audit entry',
  FILL: 'Fill',
  CASH: 'Cash movement',
  HOLDING: 'Holding movement',
};

/**
 * Operations trade lookup (BR-15): every recorded step of one trade, oldest first, so a trade can
 * be reconstructed for an audit or a client dispute. The order ID lives in the URL (/trades/:id).
 */
@Component({
  selector: 'app-trade-lookup-page',
  imports: [DatePipe, DecimalPipe, KeyValuePipe, DashboardIcon, PageHeading],
  templateUrl: './trade-lookup-page.html',
  styleUrl: './trade-lookup-page.scss',
})
export class TradeLookupPage implements OnDestroy {
  private readonly trail = inject(TRADE_TRAIL, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly params?: Subscription;
  readonly query = signal('');
  readonly result = signal<TradeTrailResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  /** Outcome, money and shares moved, and whether the records agree; derived from the trail. */
  readonly summary = computed(() => {
    const trail = this.result();
    return trail ? tradeCase(trail) : null;
  });
  readonly problems = computed(() => this.summary()?.checks.filter((check) => !check.ok).length ?? 0);
  private requested = '';

  constructor() {
    this.params = inject(ActivatedRoute, { optional: true })?.paramMap.subscribe((params) => {
      void this.show(params.get('id') ?? '');
    });
  }

  /** Opens the typed order ID; the URL change loads it, so the lookup can be bookmarked. */
  submit(): void {
    const id = this.query().trim();
    if (!ORDER_ID.test(id)) {
      this.result.set(null);
      this.error.set('Enter the full order ID, for example 3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f.');
      return;
    }
    void this.router?.navigate(['/trades', id.toLowerCase()]);
  }

  /** Loads one trade's trail; a stale response for an earlier ID is ignored. */
  async show(id: string): Promise<void> {
    this.requested = id;
    this.query.set(id);
    this.result.set(null);
    this.error.set('');
    if (!id || !this.trail) {
      return;
    }
    if (!ORDER_ID.test(id)) {
      this.error.set('That is not a valid order ID.');
      return;
    }
    this.loading.set(true);
    try {
      const trail = await this.trail.load(id);
      if (this.requested === id) {
        this.result.set(trail);
      }
    } catch (failure) {
      if (this.requested === id) {
        this.error.set((failure as { status?: number }).status === 404
          ? 'No trade was found with that order ID.'
          : 'Could not load the trade trail. Please try again.');
      }
    } finally {
      if (this.requested === id) {
        this.loading.set(false);
      }
    }
  }

  sourceLabel(source: string): string {
    return SOURCES[source] ?? source;
  }
  /** Readable label for a step type such as ORDER_FILLED. */
  typeLabel(type: string): string {
    const words = type.toLowerCase().replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  detail(value: unknown): string {
    if (value === null || value === undefined) {
      return '–';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  ngOnDestroy(): void {
    this.requested = '';
    this.params?.unsubscribe();
  }
}
