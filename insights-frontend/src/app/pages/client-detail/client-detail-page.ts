import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ACCOUNT_ID, CLIENT_ACCOUNTS, codeLabel,
  type ClientDetail, type ClientOrder, type ClientSummary, type OrderFilters, type Page,
} from '../../client-accounts';
import { AuthService } from '../../auth.service';
import { centralDateTimeSeconds, centralDay, centralTime } from '../../shared/app-time';

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PRICE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const COUNT = new Intl.NumberFormat('en-US');
const SEARCH_DELAY_MS = 300;
/** The overview chart reads at most this many pages of fills (25 each), newest first. */
const ACTIVITY_PAGES = 4;
/**
 * Allocation colours, largest holding first: NextTrade green, then distinct but muted hues so each slice is easy to
 * tell apart without turning into a rainbow; anything past the sixth is grouped as Other (grey).
 */
const HUES = ['#94c973', '#6f9fc2', '#d4b06a', '#a98fc9', '#d08a72', '#5fb3a3'];
const OTHER = '#5f645c';
const RING_RADIUS = 58;
const RING = 2 * Math.PI * RING_RADIUS;

type Tab = 'overview' | 'orders';

/**
 * One trading account (TS-18.5): its summary and holdings, and its filled orders newest first, all from
 * the reporting dataset.
 * Operations staff can open any order in Trade lookup from here; analysts see the same orders
 * without the link. The back link returns to the Clients list with its filters.
 */
@Component({
  selector: 'app-client-detail-page',
  imports: [RouterLink],
  templateUrl: './client-detail-page.html',
  styleUrls: ['./client-detail-page.scss', './client-detail-page.novice.scss'],
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
  /** The account's fills for the overview chart (up to {@link ACTIVITY_PAGES} pages), separate from the paged Orders tab. */
  readonly fills = signal<ClientOrder[] | null>(null);
  readonly fillsTotal = signal(0);
  readonly fillsError = signal(false);
  readonly ringRadius = RING_RADIUS;
  /** Holdings as ring segments by cost basis, largest first. */
  readonly allocation = computed(() => {
    const holdings = [...(this.detail()?.holdings ?? [])].filter((h) => h.costBasis > 0).sort((a, b) => b.costBasis - a.costBasis);
    const total = holdings.reduce((sum, h) => sum + h.costBasis, 0);
    if (!total) {
      return [];
    }
    const slices = holdings.slice(0, HUES.length).map((h, i) => ({ symbol: h.symbol, value: h.costBasis, color: HUES[i] }));
    const rest = holdings.slice(HUES.length).reduce((sum, h) => sum + h.costBasis, 0);
    if (rest) {
      slices.push({ symbol: 'Other', value: rest, color: OTHER });
    }
    let start = 0;
    return slices.map((slice) => {
      const length = (slice.value / total) * RING;
      const arc = {
        ...slice,
        share: (slice.value / total) * 100,
        dash: `${Math.max(length - 2, 0).toFixed(2)} ${RING.toFixed(2)}`,
        offset: (-start).toFixed(2),
      };
      start += length;
      return arc;
    });
  });
  /** The largest single holding's share; slices are largest first, and "Other" groups several holdings, so it never counts. */
  readonly largestShare = computed(() => this.allocation()[0]?.share ?? 0);
  /** Value bought and sold per stock from the loaded fills, busiest stocks first. */
  readonly flows = computed(() => {
    const perStock = new Map<string, { symbol: string; bought: number; sold: number }>();
    for (const fill of this.fills() ?? []) {
      if (fill.fillPrice === null) {
        continue;
      }
      const entry = perStock.get(fill.symbol) ?? { symbol: fill.symbol, bought: 0, sold: 0 };
      if (fill.side === 'BUY') {
        entry.bought += fill.quantity * fill.fillPrice;
      } else {
        entry.sold += fill.quantity * fill.fillPrice;
      }
      perStock.set(fill.symbol, entry);
    }
    const rows = [...perStock.values()].sort((a, b) => b.bought + b.sold - (a.bought + a.sold)).slice(0, 8);
    const max = Math.max(0, ...rows.map((row) => Math.max(row.bought, row.sold)));
    return rows.map((row) => ({
      ...row,
      boughtWidth: max ? (row.bought / max) * 100 : 0,
      soldWidth: max ? (row.sold / max) * 100 : 0,
    }));
  });
  /** Value bought and sold across the loaded fills, for the Orders tab summary. */
  readonly balance = computed(() => {
    const fills = this.fills();
    if (!fills) {
      return null;
    }
    let bought = 0, sold = 0, buys = 0, sells = 0;
    for (const fill of fills) {
      const value = fill.fillPrice === null ? 0 : fill.quantity * fill.fillPrice;
      if (fill.side === 'BUY') {
        bought += value;
        buys++;
      } else {
        sold += value;
        sells++;
      }
    }
    return { bought, sold, buys, sells };
  });
  private detailRequest = 0;
  private fillsRequest = 0;
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
    this.fills.set(null);
    this.fillsTotal.set(0);
    this.fillsError.set(false);
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
        void this.loadFills(id);
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

  /** Reads the account's fills, newest first, for the overview chart. */
  async loadFills(id: string): Promise<void> {
    if (!this.clients || this.destroyed) {
      return;
    }
    const request = ++this.fillsRequest;
    const collected: ClientOrder[] = [];
    try {
      for (let page = 0; page < ACTIVITY_PAGES; page++) {
        const result = await this.clients.orders(id, { search: '', page });
        if (request !== this.fillsRequest || this.destroyed) {
          return;
        }
        collected.push(...result.content);
        this.fillsTotal.set(result.totalElements);
        if (page + 1 >= result.totalPages) {
          break;
        }
      }
      this.fills.set(collected);
    } catch {
      if (request === this.fillsRequest && !this.destroyed) {
        this.fillsError.set(true);
      }
    }
  }

  /** A holding's colour in the allocation ring. */
  holdingColor(symbol: string): string {
    return this.allocation().find((slice) => slice.symbol === symbol)?.color ?? OTHER;
  }
  /** A holding's share of the account's cost basis, to one decimal. */
  weight(costBasis: number): string {
    const total = this.costBasis();
    return total ? `${((costBasis / total) * 100).toFixed(1)}%` : '–';
  }
  /** Shares times fill price, or a dash when the price is missing. */
  orderValue(order: ClientOrder): string {
    return order.fillPrice === null ? '–' : MONEY.format(order.quantity * order.fillPrice);
  }
  percent(value: number): string {
    return `${value.toFixed(1)}%`;
  }
  /** Colour for a trader level or account status, used as text colour. */
  tone(code: string): string {
    return ({ NOVICE: '#7fb3d5', ADVANCED: '#c9a6e8', ACTIVE: '#94c973', PENDING: '#e2b65a', BLOCKED: '#ff7a6e', CLOSED: '#7e8279' } as Record<string, string>)[code] ?? '#f2f0e9';
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
