import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ACCOUNT_ID, CLIENT_ACCOUNTS, codeLabel,
  type ClientDetail, type ClientOrder, type ClientSummary, type OrderFilters, type Page,
} from '../../client-accounts';
import { AuthService } from '../../auth.service';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { KpiTile } from '../../shared/kpi-tile';
import { centralDateTimeSeconds, centralDay, centralTime } from '../../shared/app-time';

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PRICE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const COUNT = new Intl.NumberFormat('en-US');
const SEARCH_DELAY_MS = 300;

type Tab = 'overview' | 'orders';

/**
 * One trading account (TS-18.5): its summary and holdings, and its filled orders newest first, all from
 * the reporting dataset.
 * Operations staff can open any order in Trade lookup from here; analysts see the same orders
 * without the link. The back link returns to the Clients list with its filters.
 */
@Component({
  selector: 'app-client-detail-page',
  imports: [RouterLink, DashboardIcon, KpiTile],
  templateUrl: './client-detail-page.html',
  styleUrl: './client-detail-page.scss',
})
export class ClientDetailPage {
  private readonly clients = inject(CLIENT_ACCOUNTS, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  readonly accountId = signal('');
  readonly detail = signal<ClientDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly tab = signal<Tab>('overview');
  readonly orderFilters = signal<OrderFilters>({ search: '', page: 0 });
  readonly orders = signal<Page<ClientOrder> | null>(null);
  readonly ordersLoading = signal(false);
  readonly ordersError = signal('');
  /** Operations staff investigate trades, so only they get the link into Trade lookup (BR-15). */
  readonly operations = computed(() => this.auth?.userRole === 'OPERATIONS');
  readonly costBasis = computed(() => this.detail()?.holdings.reduce((sum, holding) => sum + holding.costBasis, 0) ?? 0);
  private detailRequest = 0;
  private ordersRequest = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    const params = inject(ActivatedRoute, { optional: true })?.paramMap.subscribe((map) => {
      void this.open(map.get('id') ?? '');
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.searchTimer);
      params?.unsubscribe();
    });
  }

  /** Loads an account; switching accounts resets the Orders tab. */
  async open(id: string): Promise<void> {
    const request = ++this.detailRequest;
    this.accountId.set(id);
    this.detail.set(null);
    this.orders.set(null);
    this.orderFilters.set({ search: '', page: 0 });
    this.tab.set('overview');
    this.error.set('');
    if (!this.clients) {
      return;
    }
    if (!ACCOUNT_ID.test(id)) {
      this.error.set('That is not a valid account link.');
      return;
    }
    this.loading.set(true);
    try {
      const detail = await this.clients.detail(id);
      if (request === this.detailRequest && !this.destroyed) {
        this.detail.set(detail);
      }
    } catch (failure) {
      if (request === this.detailRequest && !this.destroyed) {
        this.error.set((failure as { status?: number }).status === 404
          ? 'No trading account was found for this link.'
          : 'Could not load this account. Please try again.');
      }
    } finally {
      if (request === this.detailRequest) {
        this.loading.set(false);
      }
    }
  }

  /** Shows a tab; orders load the first time their tab opens. */
  show(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'orders' && !this.orders() && !this.ordersLoading()) {
      void this.loadOrders();
    }
  }

  filterOrders(change: Partial<OrderFilters>): void {
    this.orderFilters.set({ ...this.orderFilters(), page: 0, ...change });
    void this.loadOrders();
  }

  searchOrders(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.filterOrders({ search: value }), SEARCH_DELAY_MS);
  }

  ordersPage(page: number): void {
    this.orderFilters.set({ ...this.orderFilters(), page });
    void this.loadOrders();
  }

  async loadOrders(): Promise<void> {
    const id = this.accountId();
    if (!this.clients || !ACCOUNT_ID.test(id) || this.destroyed) {
      return;
    }
    const request = ++this.ordersRequest;
    this.ordersLoading.set(true);
    this.ordersError.set('');
    try {
      const page = await this.clients.orders(id, this.orderFilters());
      if (request === this.ordersRequest && !this.destroyed) {
        this.orders.set(page);
      }
    } catch {
      if (request === this.ordersRequest && !this.destroyed) {
        this.ordersError.set('Could not load this account\'s orders. Please try again.');
      }
    } finally {
      if (request === this.ordersRequest) {
        this.ordersLoading.set(false);
      }
    }
  }

  /** The first block of an order ID: enough to tell orders apart on screen; the full ID is in the tooltip. */
  shortId(orderId: string): string {
    return orderId.slice(0, 8);
  }
  /** Owner's name, email and the account label, leaving out whatever the account does not have. */
  owner(account: ClientSummary): string {
    return [account.clientName, account.email, account.accountName].filter(Boolean).join(' · ');
  }
  label(code: string): string {
    return codeLabel(code);
  }
  money(value: number): string {
    return MONEY.format(value);
  }
  price(value: number | null): string {
    return value === null ? '–' : PRICE.format(value);
  }
  count(value: number): string {
    return COUNT.format(value);
  }
  readonly day = centralDay;
  readonly time = centralTime;
  readonly dateTime = centralDateTimeSeconds;
}
