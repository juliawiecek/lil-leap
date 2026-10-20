import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TRADE_RECORDS, type TradeEvent, type TradeRecord } from '../../trade-records';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { PageHeading } from '../../shared/page-heading';
import { codeLabel } from '../../client-accounts';
import { centralClockSeconds, centralDateTimeSeconds } from '../../shared/app-time';
import { tradeCase } from './trade-case';

/** Order and account IDs are both UUIDs. */
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PRICE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const COUNT = new Intl.NumberFormat('en-US');

type Kind = 'money' | 'signedMoney' | 'shares' | 'time' | 'code' | 'text';
/** How each recorded field is shown to operations staff, in display order. Internal IDs are left out. */
const FIELDS: Record<string, { label: string; kind: Kind }> = {
  reasonText: { label: 'Reason', kind: 'text' },
  reasonCode: { label: 'Reason code', kind: 'code' },
  quantity: { label: 'Shares', kind: 'shares' },
  quantityChange: { label: 'Shares', kind: 'shares' },
  price: { label: 'Price', kind: 'money' },
  executionPrice: { label: 'Price', kind: 'money' },
  costBasis: { label: 'Cost basis', kind: 'money' },
  amount: { label: 'Cash', kind: 'signedMoney' },
  cashDelta: { label: 'Cash', kind: 'signedMoney' },
  quoteTimestamp: { label: 'Quote time', kind: 'time' },
  settledAt: { label: 'Settled', kind: 'time' },
};
/** Identifiers and units that mean nothing to a reader; the step itself is enough. */
const HIDDEN = new Set(['fillId', 'quoteId', 'currency']);
/** Plain names for where each step was recorded. */
const SOURCES: Record<string, string> = {
  STATUS: 'Status change',
  AUDIT: 'Audit entry',
  FILL: 'Fill',
  CASH: 'Cash movement',
  HOLDING: 'Holding movement',
};

/**
 * Operations trade lookup (BR-15): one trade's fill, the client behind it and every recorded step,
 * oldest first, from the reporting dataset the Clients and Reports pages read, so a trade can be
 * reconstructed for an audit or a client dispute. The order ID lives in the URL (/trades/:id).
 */
@Component({
  selector: 'app-trade-lookup-page',
  imports: [RouterLink, DashboardIcon, PageHeading],
  templateUrl: './trade-lookup-page.html',
  styleUrl: './trade-lookup-page.scss',
})
export class TradeLookupPage implements OnDestroy {
  private readonly trades = inject(TRADE_RECORDS, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly params?: Subscription;
  private readonly from?: Subscription;
  readonly query = signal('');
  /** The client account this lookup was opened from (Clients > Orders), for the way back. */
  readonly fromAccount = signal('');
  readonly result = signal<TradeRecord | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  /** Outcome, money and shares moved, and whether the records agree; derived from the steps. */
  readonly summary = computed(() => {
    const trade = this.result();
    return trade ? tradeCase(trade) : null;
  });
  readonly problems = computed(() => this.summary()?.checks.filter((check) => !check.ok).length ?? 0);
  private requested = '';

  constructor() {
    const route = inject(ActivatedRoute, { optional: true });
    this.params = route?.paramMap.subscribe((params) => {
      void this.show(params.get('id') ?? '');
    });
    this.from = route?.queryParamMap?.subscribe((query) => {
      const account = query.get('account') ?? '';
      this.fromAccount.set(ORDER_ID.test(account) ? account.toLowerCase() : '');
    });
  }

  /** Returns to the client account the order was opened from. */
  backToAccount(): void {
    void this.router?.navigate(['/clients', this.fromAccount()]);
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

  /** Loads one trade; a stale response for an earlier ID is ignored. */
  async show(id: string): Promise<void> {
    this.requested = id;
    this.query.set(id);
    this.result.set(null);
    this.error.set('');
    if (!id || !this.trades) {
      return;
    }
    if (!ORDER_ID.test(id)) {
      this.error.set('That is not a valid order ID.');
      return;
    }
    this.loading.set(true);
    try {
      const trade = await this.trades.load(id);
      if (this.requested === id) {
        this.result.set(trade);
      }
    } catch (failure) {
      if (this.requested === id) {
        this.error.set((failure as { status?: number }).status === 404
          ? 'No trade was found with that order ID.'
          : 'Could not load the trade. Please try again.');
      }
    } finally {
      if (this.requested === id) {
        this.loading.set(false);
      }
    }
  }

  readonly dateTime = centralDateTimeSeconds;

  label(code: string): string {
    return codeLabel(code);
  }
  money(value: number): string {
    return MONEY.format(value);
  }
  price(value: number): string {
    return PRICE.format(value);
  }
  count(value: number): string {
    return COUNT.format(value);
  }
  sourceLabel(source: string): string {
    return SOURCES[source] ?? source;
  }
  /** A step's recorded fields as labelled, formatted values. */
  fields(event: TradeEvent): { label: string; value: string }[] {
    const values: Record<string, unknown> = event.details ?? {};
    const known = Object.keys(FIELDS).filter((key) => key in values);
    const other = Object.keys(values).filter((key) => !(key in FIELDS) && !HIDDEN.has(key));
    return [...known, ...other]
      .filter((key) => values[key] !== null && values[key] !== undefined && values[key] !== '')
      .map((key) => ({
        label: FIELDS[key]?.label ?? codeLabel(key.replace(/([a-z])([A-Z])/g, '$1_$2')),
        value: this.format(values[key], FIELDS[key]?.kind ?? 'text'),
      }));
  }

  private format(value: unknown, kind: Kind): string {
    const number = Number(value);
    switch (kind) {
      case 'money':
        return Number.isFinite(number) ? PRICE.format(number) : String(value);
      case 'signedMoney':
        return Number.isFinite(number) ? (number < 0 ? '−' : '+') + MONEY.format(Math.abs(number)) : String(value);
      case 'shares':
        return Number.isFinite(number) ? String(number) : String(value);
      case 'time': {
        const time = new Date(String(value));
        return Number.isNaN(time.getTime()) ? String(value) : centralClockSeconds(time);
      }
      case 'code':
        return codeLabel(String(value));
      default:
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  }

  ngOnDestroy(): void {
    this.requested = '';
    this.params?.unsubscribe();
    this.from?.unsubscribe();
  }
}
