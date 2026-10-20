import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TRADE_RECORDS, type TradeRecord } from '../../trade-records';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { PageHeading } from '../../shared/page-heading';
import { codeLabel } from '../../client-accounts';
import { centralDateTimeSeconds } from '../../shared/app-time';

/** Order and account IDs are both UUIDs. */
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PRICE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const COUNT = new Intl.NumberFormat('en-US');

/**
 * Operations trade lookup (BR-15): one trade's fill and the client behind it, from the reporting
 * dataset the Clients and Reports pages read. The order ID lives in the URL (/trades/:id).
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

  ngOnDestroy(): void {
    this.requested = '';
    this.params?.unsubscribe();
    this.from?.unsubscribe();
  }
}
