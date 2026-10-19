import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TRADE_TRAIL, type TradeEvent, type TradeTrailResponse } from '../../trade-trail';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { PageHeading } from '../../shared/page-heading';
import { tradeCase } from './trade-case';

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = 'money' | 'signedMoney' | 'shares' | 'percent' | 'time' | 'code' | 'text';
/** How each recorded field is shown to operations staff, in display order. Internal IDs are left out. */
const FIELDS: Record<string, { label: string; kind: Kind }> = {
  reasonText: { label: 'Reason', kind: 'text' },
  reasonCode: { label: 'Reason code', kind: 'code' },
  status: { label: 'Status', kind: 'code' },
  previousStatus: { label: 'Was', kind: 'code' },
  quantity: { label: 'Shares', kind: 'shares' },
  quantityChange: { label: 'Shares', kind: 'shares' },
  price: { label: 'Price', kind: 'money' },
  executionPrice: { label: 'Price', kind: 'money' },
  actualPrice: { label: 'Price offered', kind: 'money' },
  bid: { label: 'Bid', kind: 'money' },
  ask: { label: 'Ask', kind: 'money' },
  referencePrice: { label: 'Price at submission', kind: 'money' },
  limitPrice: { label: 'Worst accepted', kind: 'money' },
  tolerancePct: { label: 'Tolerance', kind: 'percent' },
  costBasis: { label: 'Cost basis', kind: 'money' },
  amount: { label: 'Cash', kind: 'signedMoney' },
  cashDelta: { label: 'Cash', kind: 'signedMoney' },
  settlementStatus: { label: 'Settlement', kind: 'code' },
  attemptNumber: { label: 'Attempt', kind: 'text' },
  quotedAt: { label: 'Quote time', kind: 'time' },
  quoteTimestamp: { label: 'Quote time', kind: 'time' },
  settledAt: { label: 'Settled', kind: 'time' },
};
/** Identifiers that mean nothing to a reader, or point at a person; the step itself is enough. */
const HIDDEN = new Set(['fillId', 'quoteId', 'cancelledBy', 'currency']);
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });

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
  imports: [DatePipe, DecimalPipe, DashboardIcon, PageHeading],
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
  /**
   * A step's recorded fields as labelled, formatted values. Audit entries keep their fields in a
   * JSON payload, which is opened up here; the stored record itself is never changed.
   */
  fields(event: TradeEvent): { label: string; value: string }[] {
    const values: Record<string, unknown> = { ...(event.details ?? {}) };
    if (typeof values['payload'] === 'string') {
      try {
        Object.assign(values, JSON.parse(values['payload'] as string));
        delete values['payload'];
      } catch {
        // Not JSON: shown as recorded below.
      }
    }
    const known = Object.keys(FIELDS).filter((key) => key in values);
    const other = Object.keys(values).filter((key) => !(key in FIELDS) && !HIDDEN.has(key));
    return [...known, ...other]
      .filter((key) => values[key] !== null && values[key] !== undefined && values[key] !== '')
      .map((key) => ({
        label: FIELDS[key]?.label ?? this.typeLabel(key.replace(/([a-z])([A-Z])/g, '$1_$2')),
        value: this.format(values[key], FIELDS[key]?.kind ?? 'text'),
      }));
  }

  private format(value: unknown, kind: Kind): string {
    const number = Number(value);
    switch (kind) {
      case 'money':
        return Number.isFinite(number) ? MONEY.format(number) : String(value);
      case 'signedMoney':
        return Number.isFinite(number) ? (number < 0 ? '−' : '+') + MONEY.format(Math.abs(number)) : String(value);
      case 'shares':
        return Number.isFinite(number) ? `${number > 0 && String(value).startsWith('+') ? '+' : ''}${number}` : String(value);
      case 'percent':
        return Number.isFinite(number) ? `${number}%` : String(value);
      case 'time': {
        const time = new Date(String(value));
        return Number.isNaN(time.getTime()) ? String(value) : time.toISOString().slice(11, 19) + ' UTC';
      }
      case 'code':
        return this.typeLabel(String(value));
      default:
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  }

  ngOnDestroy(): void {
    this.requested = '';
    this.params?.unsubscribe();
  }
}
