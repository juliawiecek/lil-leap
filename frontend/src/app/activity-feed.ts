import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { OrderHistoryRow } from './order-history-api';
import { OrderHistoryService } from './order-history.service';
import { AccountsService } from './accounts.service';
import { CashActivityService } from './cash-activity.service';
import { ACTIVITY_KINDS, ActivityKind, CashMovement, buildActivity, formatLocalTime, formatMoney } from './activity-api';

/** How often the feed re-reads, matching the dashboards' price refresh. */
export const ACTIVITY_REFRESH_MS = 5000;

/**
 * One activity feed (PS-11, BR-11): orders, fills, rejections and cash movements in a single
 * newest-first timeline with All / Orders / Cash and date filters. It refreshes itself every few
 * seconds and when another account is picked, so a placed order shows its result with no page
 * change. The compact form sits on the dashboards; the full form is the Activity page.
 */
@Component({
  selector: 'app-activity-feed',
  templateUrl: './activity-feed.html',
  styleUrl: './activity-feed.scss',
  host: { '[class.compact]': 'compact()' },
})
export class ActivityFeed implements OnInit, OnDestroy {
  readonly #orders = inject(OrderHistoryService);
  readonly #cash = inject(CashActivityService);
  /** Absent outside the trading workspace; the feed then covers every account. */
  readonly #accounts = inject(AccountsService, { optional: true });
  readonly #pageState = inject(PageState, { optional: true });
  readonly #stopAccountWatch = this.#accounts?.onChange(() => void this.load());
  #request = 0;
  #refreshTimer: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;
  #routing?: PageBinding;

  /** The dashboard form: newest few rows, no date filters, and a link to the full page. */
  readonly compact = input(false);
  readonly limit = input<number | null>(null);
  readonly viewAll = output<void>();

  readonly kinds = ACTIVITY_KINDS;
  readonly kind = signal<ActivityKind>('All');
  readonly from = signal('');
  readonly to = signal('');
  readonly orders = signal<OrderHistoryRow[]>([]);
  readonly cash = signal<CashMovement[]>([]);
  readonly loading = signal(false);
  /** Nothing could be loaded. */
  readonly error = signal('');
  /** One of the two sources failed; the other is still shown. */
  readonly partial = signal('');
  readonly loaded = signal(false);
  readonly items = computed(() => {
    const all = buildActivity(this.orders(), this.cash(), this.kind());
    const limit = this.limit();
    return limit ? all.slice(0, limit) : all;
  });
  readonly hasFilters = computed(() => this.kind() !== 'All' || !!this.from() || !!this.to());
  readonly money = formatMoney;
  readonly when = formatLocalTime;

  ngOnInit(): void {
    if (!this.compact()) {
      this.#routing = this.#pageState?.connect(signal('Activity'), PAGE_PATHS, [
        { key: 'kind', value: this.kind, allowed: [...ACTIVITY_KINDS] },
        { key: 'from', value: this.from, date: true }, { key: 'to', value: this.to, date: true },
      ], () => { if (this.#routing) { void this.load(); } });
    }
    void this.load();
    this.#scheduleRefresh();
  }

  ngOnDestroy(): void {
    ++this.#request;
    this.#routing?.destroy();
    this.#stopAccountWatch?.();
    this.#destroyed = true;
    clearTimeout(this.#refreshTimer);
  }

  setKind(kind: ActivityKind): void {
    this.kind.set(kind);
  }

  setFrom(value: string): void {
    this.from.set(value);
    void this.load();
  }

  setTo(value: string): void {
    this.to.set(value);
    void this.load();
  }

  clearFilters(): void {
    this.kind.set('All');
    this.from.set('');
    this.to.set('');
    void this.load();
  }

  /** "FILLED" becomes "Filled", "SETTLED" becomes "Settled". */
  statusLabel(status: string): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  /** Reads orders and cash movements together; either failing alone still shows the other. */
  async load(): Promise<void> {
    const request = ++this.#request;
    if (this.from() && this.to() && this.from() > this.to()) {
      this.loading.set(false);
      this.error.set('The start date must be on or before the end date.');
      this.orders.set([]);
      this.cash.set([]);
      return;
    }
    this.loading.set(true);
    const accountId = this.#accounts?.selected()?.account_id;
    const filters = { from: this.from(), to: this.to(), ...(accountId ? { accountId } : {}) };
    const [orders, cash] = await Promise.allSettled([this.#orders.list(filters), this.#cash.list(filters)]);
    if (request !== this.#request) {
      return;
    }
    this.loading.set(false);
    this.loaded.set(true);
    if (orders.status === 'rejected' && cash.status === 'rejected') {
      this.error.set(reason(orders.reason, 'Could not load your activity. Please try again.'));
      this.orders.set([]);
      this.cash.set([]);
      this.partial.set('');
      return;
    }
    this.error.set('');
    this.orders.set(orders.status === 'fulfilled' ? orders.value : []);
    this.cash.set(cash.status === 'fulfilled' ? cash.value : []);
    if (orders.status === 'rejected') {
      this.partial.set('Orders could not be loaded right now; showing cash movements only.');
    } else if (cash.status === 'rejected') {
      this.partial.set('Deposits and transfers could not be loaded right now; showing orders only.');
    } else {
      this.partial.set('');
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
    }, ACTIVITY_REFRESH_MS);
  }
}

function reason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
