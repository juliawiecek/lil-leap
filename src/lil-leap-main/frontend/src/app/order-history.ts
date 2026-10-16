import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { OrderHistoryRow } from './order-history-api';
import { OrderHistoryService } from './order-history.service';
import { AccountsService } from './accounts.service';

/**
 * The signed-in user's real order history with date and status filters (NEXT-118, BR-11).
 * Changing a filter, or the account picked in the header, reloads the list in place; the page never reloads.
 */
@Component({
  selector: 'app-order-history',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './order-history.html',
  styleUrl: './order-history.scss',
})
export class OrderHistory implements OnInit, OnDestroy {
  readonly #orders = inject(OrderHistoryService);
  /** Absent outside the trading workspace; the list then covers every account. */
  readonly #accounts = inject(AccountsService, { optional: true });
  readonly #stopAccountWatch = this.#accounts?.onChange(() => void this.load());
  /** Increments per request so a slow earlier response can't overwrite a newer one. */
  #request = 0;
  #refreshTimer: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;

  readonly statusOptions = [
    { value: '', label: 'All' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'ACCEPTED', label: 'Accepted' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'DELAYED', label: 'Delayed' },
    { value: 'FILLED', label: 'Filled' },
    { value: 'REJECTED', label: 'Rejected' },
  ];
  readonly rows = signal<OrderHistoryRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly status = signal('');

  private routing?: PageBinding;
  constructor() {
    this.routing = inject(PageState, { optional: true })?.connect(signal('History'), PAGE_PATHS, [
      { key: 'from', value: this.from, date: true }, { key: 'to', value: this.to, date: true },
      { key: 'status', value: this.status, allowed: this.statusOptions.map(option => option.value) },
    ], () => { if (this.routing) { void this.load(); } });
  }
  ngOnInit(): void {
    void this.load();
    this.#scheduleRefresh();
  }

  ngOnDestroy(): void {
    ++this.#request; this.routing?.destroy();
    this.#stopAccountWatch?.();
    this.#destroyed = true;
    clearTimeout(this.#refreshTimer);
  }

  setFrom(value: string): void {
    this.from.set(value);
    void this.load();
  }

  setTo(value: string): void {
    this.to.set(value);
    void this.load();
  }

  setStatus(value: string): void {
    this.status.set(value);
    void this.load();
  }

  clearFilters(): void {
    this.from.set('');
    this.to.set('');
    this.status.set('');
    void this.load();
  }

  hasFilters(): boolean {
    return !!(this.from() || this.to() || this.status());
  }

  /** "FILLED" becomes "Filled" for display. */
  statusLabel(status: string): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  async load(): Promise<void> {
    const request = ++this.#request;
    if (this.from() && this.to() && this.from() > this.to()) {
      this.loading.set(false);
      this.error.set('The start date must be on or before the end date.');
      this.rows.set([]);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const accountId = this.#accounts?.selected()?.account_id;
      const rows = await this.#orders.list({
        from: this.from(), to: this.to(), status: this.status(), ...(accountId ? { accountId } : {}),
      });
      if (request === this.#request) {
        this.rows.set(rows);
      }
    } catch (e) {
      if (request === this.#request) {
        this.rows.set([]);
        this.error.set(e instanceof Error ? e.message : 'Could not load your orders. Please try again.');
      }
    } finally {
      if (request === this.#request) {
        this.loading.set(false);
      }
    }
  }

  #scheduleRefresh(): void {
    clearTimeout(this.#refreshTimer);
    // A load still in flight at destroy time must not re-arm the timer.
    if (this.#destroyed) {
      return;
    }
    this.#refreshTimer = setTimeout(async () => {
      await this.load();
      this.#scheduleRefresh();
    }, 5000);
  }
}
