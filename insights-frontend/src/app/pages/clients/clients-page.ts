import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, type Params } from '@angular/router';
import {
  CLIENT_ACCOUNTS, DEFAULT_SORT, codeLabel,
  type ClientFilters, type ClientSummary, type Page,
} from '../../client-accounts';
import { AuthService } from '../../auth.service';
import { centralDayTime } from '../../shared/app-time';

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const COUNT = new Intl.NumberFormat('en-US');
const SEARCH_DELAY_MS = 300;

/** Sortable columns, in display order, with the direction a first click sorts in. */
const COLUMNS = [
  { key: 'accountNumber', label: 'Account', numeric: false, first: 'asc' },
  { key: 'clientName', label: 'Client', numeric: false, first: 'asc' },
  { key: 'accountName', label: 'Account name', numeric: false, first: 'asc' },
  { key: 'traderLevel', label: 'Trader level', numeric: false, first: 'asc' },
  { key: 'status', label: 'Status', numeric: false, first: 'asc' },
  { key: 'tradedValue', label: 'Traded value', numeric: true, first: 'desc' },
  { key: 'tradeCount', label: 'Trades', numeric: true, first: 'desc' },
  { key: 'lastTradeAt', label: 'Last trade', numeric: false, first: 'desc' },
] as const;

/** Reads the list's filters from the URL, so a reload, a bookmark or the detail page's back link keep them. */
export function filtersFrom(params: Params): ClientFilters {
  const page = Number(params['page']);
  return {
    search: String(params['search'] ?? ''),
    level: String(params['level'] ?? ''),
    status: String(params['status'] ?? ''),
    sort: String(params['sort'] ?? DEFAULT_SORT),
    page: Number.isInteger(page) && page > 0 ? page : 0,
  };
}

/** The URL query for a set of filters; defaults are left out to keep links short. */
export function filterParams(filters: ClientFilters): Params {
  return {
    search: filters.search.trim() || null,
    level: filters.level || null,
    status: filters.status || null,
    sort: filters.sort === DEFAULT_SORT ? null : filters.sort,
    page: filters.page || null,
  };
}

/**
 * Clients page (TS-18.5): every trading account in the reporting dataset with its owner, trader level,
 * status and trades.
 * Search covers account numbers and names and the client's name and email, and a pasted account
 * or order ID finds its account.
 */
@Component({
  selector: 'app-clients-page',
  imports: [RouterLink],
  templateUrl: './clients-page.html',
  styleUrls: ['./clients-page.scss', './clients-page.novice.scss'],
})
export class ClientsPage {
  private readonly clients = inject(CLIENT_ACCOUNTS, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  readonly columns = COLUMNS;
  /** Filter choices; an empty value means no filter. */
  readonly levelOptions = [
    { value: '', label: 'All levels' },
    { value: 'NOVICE', label: 'Novice' },
    { value: 'ADVANCED', label: 'Advanced' },
  ];
  readonly statusOptions = [
    { value: '', label: 'All statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'BLOCKED', label: 'Blocked' },
    { value: 'CLOSED', label: 'Closed' },
  ];
  readonly filters = signal<ClientFilters>(filtersFrom({}));
  readonly result = signal<Page<ClientSummary> | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly operations = computed(() => this.auth?.userRole === 'OPERATIONS');
  readonly filtered = computed(() => {
    const { search, level, status } = this.filters();
    return Boolean(search.trim() || level || status);
  });
  readonly range = computed(() => {
    const page = this.result();
    if (!page || !page.totalElements) {
      return '';
    }
    const first = page.page * page.size + 1;
    return `${COUNT.format(first)}–${COUNT.format(first + page.content.length - 1)} of ${COUNT.format(page.totalElements)}`;
  });
  private request = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    const params = inject(ActivatedRoute, { optional: true })?.queryParams.subscribe((query) => {
      this.filters.set(filtersFrom(query));
      void this.load();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.searchTimer);
      params?.unsubscribe();
    });
    if (!params) {
      void this.load();
    }
  }

  /** Applies new filters through the URL; any filter change goes back to the first page. */
  update(change: Partial<ClientFilters>): void {
    const next = { ...this.filters(), page: 0, ...change };
    this.filters.set(next);
    if (this.router) {
      void this.router.navigate([], { queryParams: filterParams(next), replaceUrl: true });
    } else {
      void this.load();
    }
  }

  /** Searches once typing pauses, so each keystroke does not query the replica. */
  search(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.update({ search: value }), SEARCH_DELAY_MS);
  }

  /** Sorts by a column, or flips the direction when it is already the sort column. */
  sortBy(key: string, first: string): void {
    const [current, direction] = this.filters().sort.split(',');
    this.update({ sort: `${key},${current === key ? (direction === 'asc' ? 'desc' : 'asc') : first}` });
  }

  /** The `aria-sort` value of a column header. */
  sortState(key: string): 'ascending' | 'descending' | 'none' {
    const [current, direction] = this.filters().sort.split(',');
    return current !== key ? 'none' : direction === 'desc' ? 'descending' : 'ascending';
  }

  goToPage(page: number): void {
    this.update({ page });
  }

  clear(): void {
    clearTimeout(this.searchTimer);
    this.update({ search: '', level: '', status: '' });
  }

  async load(): Promise<void> {
    if (!this.clients || this.destroyed) {
      return;
    }
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.clients.list(this.filters());
      if (request === this.request && !this.destroyed) {
        this.result.set(page);
      }
    } catch (failure) {
      if (request === this.request && !this.destroyed) {
        this.error.set((failure as { status?: number }).status === 400
          ? 'Those filters could not be applied. Clear them and try again.'
          : 'Could not load client accounts. Please try again.');
      }
    } finally {
      if (request === this.request) {
        this.loading.set(false);
      }
    }
  }

  label(code: string): string {
    return codeLabel(code);
  }
  money(value: number): string {
    return MONEY.format(value);
  }
  count(value: number): string {
    return COUNT.format(value);
  }
  readonly dayTime = centralDayTime;
}
