import { StatusBadge } from './status-badge';
import { FinancialChange } from './financial-change';
import { FocusAfterChange } from './focus-after-change';
import { DateField } from './date-field';
import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { OrderHistoryRow, OrderTrail } from './order-history-api';
import { OrderHistoryService } from './order-history.service';
import { AccountsService } from './accounts.service';
import { CashActivityService } from './cash-activity.service';
import { ACTIVITY_KINDS, ActivityItem, ActivityKind, CashMovement, TrailStep, buildActivity, formatLocalTime, formatMoney, trailStep } from './activity-api';

/** How often the feed re-reads, matching the dashboards' price refresh. */
export const ACTIVITY_REFRESH_MS = 5000;

/** Statuses in which an order is still waiting and can be cancelled (PS-14). */
export const CANCELLABLE: ReadonlySet<string> = new Set(['SUBMITTED', 'ACCEPTED', 'PENDING', 'DELAYED']);

/**
 * One activity feed (PS-11, BR-11): orders, fills, rejections and cash movements in a single
 * newest-first timeline with All / Orders / Cash and date filters. It refreshes itself every few
 * seconds and when another account is picked, so a placed order shows its result with no page
 * change. The compact form sits on the dashboards; the full form is the Activity page.
 */
@Component({
  selector: 'app-activity-feed',
  imports: [FinancialChange, StatusBadge, FocusAfterChange, DateField],
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
  readonly returnToOrder = signal<string | null>(null);

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
  /** The order whose one-line "Cancel this order?" confirm is showing, if any. */
  readonly confirming = signal<string | null>(null);
  readonly cancelling = signal(false);
  /** Outcome of the last cancel, e.g. "Order cancelled: 1 AAPL. Nothing was charged." */
  readonly notice = signal('');
  /** The order whose audit trail is open under its row (BR-15), if any. */
  readonly expanded = signal<string | null>(null);
  readonly trail = signal<OrderTrail | null>(null);
  readonly trailLoading = signal(false);
  readonly trailError = signal('');
  /** The open trail as plain-language steps, oldest first. */
  readonly steps = computed<TrailStep[]>(() => this.trail()?.events.map((event) => trailStep(event)) ?? []);
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

  canCancel(item: ActivityItem): boolean {
    return item.kind === 'order' && !!item.orderId && CANCELLABLE.has(item.status);
  }

  askCancel(item: ActivityItem): void {
    this.returnToOrder.set(null);
    this.confirming.set(item.orderId ?? null);
    this.notice.set('');
  }

  keepOrder(item: ActivityItem): void {
    this.returnToOrder.set(item.orderId ?? null);
    this.confirming.set(null);
  }

  /** Cancels the confirmed order; the feed then reloads, so it shows "Cancelled" or the order's real status. */
  async confirmCancel(item: ActivityItem): Promise<void> {
    if (this.cancelling() || !item.orderId) {
      return;
    }
    this.cancelling.set(true);
    try {
      await this.#orders.cancel(item.orderId);
      this.notice.set(`Order cancelled: ${item.title.replace(/^(Buy|Sell) /, '')}. Nothing was charged.`);
    } catch (e) {
      this.notice.set(reason(e, 'Could not cancel the order. Please try again.'));
    } finally {
      this.cancelling.set(false);
      this.confirming.set(null);
      await this.load();
    }
  }

  /** Opens the audit trail under an order row, or closes it when it is already open. */
  async toggleTrail(item: ActivityItem): Promise<void> {
    if (item.kind !== 'order' || !item.orderId) {
      return;
    }
    if (this.expanded() === item.orderId) {
      this.expanded.set(null);
      this.trail.set(null);
      this.trailError.set('');
      return;
    }
    this.expanded.set(item.orderId);
    this.trail.set(null);
    await this.loadTrail(item.orderId);
  }

  /** Reads the open order's trail; a stale answer (row closed or another opened meanwhile) is dropped. */
  async loadTrail(orderId: string): Promise<void> {
    this.trailLoading.set(true);
    this.trailError.set('');
    try {
      const trail = await this.#orders.events(orderId);
      if (this.expanded() === orderId) {
        this.trail.set(trail);
      }
    } catch (e) {
      if (this.expanded() === orderId) {
        this.trailError.set(reason(e, 'Could not load the order details. Please try again.'));
      }
    } finally {
      if (this.expanded() === orderId) {
        this.trailLoading.set(false);
      }
    }
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
    // An open trail follows the feed's refresh, so a fill or rejection shows up without closing it.
    const open = this.expanded();
    if (open && orders.status === 'fulfilled' && orders.value.some((row) => row.orderId === open)) {
      void this.loadTrail(open);
    }
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
