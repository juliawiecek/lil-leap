import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { AuthService } from './auth.service';
import { AppSessionService } from './app-session.service';
﻿import { Component, OnDestroy, computed, signal, inject } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardIcon } from './dashboard-icon';
import { InsightsChart } from './insights-chart';
import {
  activityFor,
  buckets,
  clients,
  csvCell,
  filterTrades,
  instruments,
  summarize,
  trades,
  type Client,
  type Trade,
} from './insights-data';
@Component({
  selector: 'app-insights-workspace',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    UpperCasePipe,
    FormsModule,
    DashboardIcon,
    InsightsChart,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  readonly auth = inject(AuthService, { optional: true });
  readonly session = inject(AppSessionService, { optional: true });
  private routing?: PageBinding;
  readonly nav = [
    { label: 'Overview', icon: 'home' },
    { label: 'Trading Activity', icon: 'chart' },
    { label: 'Client Activity', icon: 'users' },
    { label: 'Clients', icon: 'user' },
    { label: 'Reports', icon: 'file' },
    { label: 'Trade Investigation', icon: 'search' },
    { label: 'Compliance', icon: 'shield' },
    { label: 'Settings', icon: 'settings' },
  ];
  readonly page = signal('Overview');
  readonly mobileNav = signal(false);
  /** Pages shown to each role (TS-03.5): analysts get reporting, operations staff get trade investigation. */
  readonly pagesByRole: Record<'Analyst' | 'Operations', readonly string[]> = {
    Analyst: ['Overview', 'Trading Activity', 'Client Activity', 'Clients', 'Reports', 'Settings'],
    Operations: ['Trade Investigation', 'Compliance', 'Settings'],
  };
  readonly visibleNav = computed(() => this.nav.filter((item) => this.canSee(item.label)));
  readonly notice = signal('');
  readonly query = signal('');
  readonly start = signal('2026-09-01');
  readonly end = signal('2026-09-22');
  readonly cadence = signal('Daily');
  readonly asset = signal('All');
  readonly market = signal('All');
  readonly segment = signal('All');
  readonly status = signal('All');
  readonly selectedClient = signal<Client | null>(null);
  readonly selectedTrade = signal<Trade | null>(null);
  readonly detailTab = signal('Overview');
  readonly reportType = signal('Monthly Executive Report');
  readonly reportTab = signal('Standard Reports');
  readonly exports = signal<{ name: string; at: Date; rows: number; csv: string }[]>([]);
  readonly definitions = signal(false);
  readonly compact = signal(false);
  readonly segments = ['Under $10K', '$10K–$100K', 'Over $100K'];
  readonly classes = ['Equities', 'FX', 'Crypto'];
  readonly colors = ['#7ede8b', '#77a9bc', '#b29acd'];
  readonly reportTypes = [
    'Monthly Executive Report',
    'Trading Activity Report',
    'Client Activity Summary',
  ];
  readonly dateError = computed(() =>
    !this.start() || !this.end() || this.start() > this.end()
      ? 'Choose a valid start and end date.'
      : '',
  );
  readonly rows = computed(() =>
    this.dateError()
      ? []
      : filterTrades(trades, {
          start: this.start(),
          end: this.end(),
          asset: this.asset(),
          market: this.market(),
          segment: this.segment(),
        }),
  );
  readonly totals = computed(() => summarize(this.rows()));
  readonly trend = computed(() => buckets(this.rows(), this.cadence()));
  readonly availableClients = computed(() =>
    this.dateError()
      ? []
      : clients.filter(
          (c) =>
            c.joined <= this.end() && (this.segment() === 'All' || c.segment === this.segment()),
        ),
  );
  readonly newClients = computed(
    () => this.availableClients().filter((c) => c.joined >= this.start()).length,
  );
  readonly clientRows = computed(() =>
    this.availableClients().filter((c) =>
      `${c.name} ${c.id}`.toLowerCase().includes(this.query().toLowerCase().trim()),
    ),
  );
  readonly dormant = computed(
    () => this.availableClients().filter((c) => this.clientActivity(c) === 'Dormant').length,
  );
  readonly mix = computed(() =>
    this.classes.map((label, i) => ({
      label,
      color: this.colors[i],
      value: summarize(this.rows().filter((t) => t.asset === label)).volume,
    })),
  );
  readonly donut = computed(() => {
    let angle = 0;
    return (
      'conic-gradient(' +
      this.mix()
        .map((m) => {
          const before = angle;
          angle += this.totals().volume ? (m.value / this.totals().volume) * 100 : 0;
          return `${m.color} ${before}% ${angle}%`;
        })
        .join(',') +
      ')'
    );
  });
  readonly ranked = computed(() =>
    instruments
      .map((i) => ({ ...i, ...summarize(this.rows().filter((t) => t.symbol === i.symbol)) }))
      .filter((i) => i.orders)
      .sort((a, b) => b.volume - a.volume),
  );
  readonly segmentRows = computed(() =>
    this.segments.map((label) => {
      const group = this.availableClients().filter((c) => c.segment === label);
      return {
        label,
        total: group.length,
        active: group.filter((c) => this.clientActivity(c) === 'Active').length,
        occasional: group.filter((c) => this.clientActivity(c) === 'Occasional').length,
        dormant: group.filter((c) => this.clientActivity(c) === 'Dormant').length,
        newClients: group.filter((c) => c.joined >= this.start()).length,
      };
    }),
  );
  readonly investigation = computed(() =>
    this.rows().filter(
      (t) =>
        (this.status() === 'All' || t.status === this.status()) &&
        `${t.id} ${t.clientId} ${t.symbol} ${this.clientName(t.clientId)}`
          .toLowerCase()
          .includes(this.query().trim().toLowerCase()),
    ),
  );
  readonly clientOrders = computed(() =>
    this.rows().filter((t) => t.clientId === this.selectedClient()?.id),
  );
  readonly statuses = computed(() =>
    ['Submitted', 'Accepted', 'Filled', 'Rejected'].map((label) => ({
      label,
      count: this.rows().filter((t) => t.status === label).length,
    })),
  );
  readonly subtitle = computed(
    () =>
      ({
        Overview: 'A clearer view of trading, clients, and the business.',
        'Trading Activity': 'Explore trading patterns across instruments and markets.',
        'Client Activity': 'Understand engagement across your book of business.',
        Clients: 'A considered view of each client and their activity.',
        Reports: 'Turn trading activity into useful business reporting.',
        'Trade Investigation': 'Follow an order from instruction to outcome.',
        Compliance: 'Review source requirements and audit readiness.',
        Settings: 'Make this workspace work for you.',
      })[this.page()],
  );
  constructor() {
    this.routing = inject(PageState, { optional: true })?.connect(this.page, PAGE_PATHS, [
      { key: 'q', value: this.query }, { key: 'start', value: this.start, date: true },
      { key: 'end', value: this.end, date: true }, { key: 'asset', value: this.asset, allowed: ['All', ...this.classes] },
      { key: 'market', value: this.market, allowed: ['All','US','Global'] },
      { key: 'segment', value: this.segment, allowed: ['All', ...this.segments] },
      { key: 'status', value: this.status, allowed: ['All','Submitted','Accepted','Filled','Rejected'] },
      { key: 'cadence', value: this.cadence, allowed: ['Daily','Weekly','Monthly','Yearly'] },
      { key: 'detailTab', value: this.detailTab, allowed: ['Overview','Orders','Documents','Lifecycle','Audit Trail'] },
      { key: 'reportType', value: this.reportType, allowed: this.reportTypes },
      { key: 'reportTab', value: this.reportTab, allowed: ['Standard Reports','Custom Reports','Scheduled Reports'] },
      { key: 'definitions', value: this.definitions }, { key: 'compact', value: this.compact },
    ], parts => {
      const tabs = parts[0] === 'clients' ? ['Overview','Orders','Documents'] : parts[0] === 'orders' ? ['Overview','Lifecycle','Audit Trail'] : ['Overview'];
      if (!tabs.includes(this.detailTab())) { this.detailTab.set('Overview'); }
      this.selectedClient.set(parts[0] === 'clients' && parts[1] ? clients.find(c => c.id === parts[1]) ?? null : null);
      this.selectedTrade.set(parts[0] === 'orders' && parts[1] ? trades.find(t => t.id === parts[1]) ?? null : null);
      if (parts[1] && !this.selectedClient() && !this.selectedTrade()) { this.notice.set('That record is unavailable.'); }
    });
    // A link or bookmark to another role's page opens this role's own workspace instead.
    if (!this.canSee(this.page())) {
      this.navigate(this.homePage());
    }
  }
  ngOnDestroy(): void { this.routing?.destroy(); }
  /** The workspace the signed-in role opens: from the token, never chosen in the page. */
  role(): 'Analyst' | 'Operations' {
    return this.auth?.userRole === 'OPERATIONS' ? 'Operations' : 'Analyst';
  }
  canSee(page: string): boolean {
    return this.pagesByRole[this.role()].includes(page);
  }
  /** Where the role lands: reporting for analysts, trade investigation for operations. */
  homePage(): string {
    return this.pagesByRole[this.role()][0];
  }
  navigate(requested: string) {
    const page = this.canSee(requested) ? requested : this.homePage();
    this.page.set(page);
    this.mobileNav.set(false);
    this.query.set('');
    this.selectedClient.set(null);
    this.selectedTrade.set(null);
    this.detailTab.set('Overview');
    this.notice.set('');
    this.routing?.go(page);
  }
  reset() {
    this.start.set('2026-09-01');
    this.end.set('2026-09-22');
    this.asset.set('All');
    this.market.set('All');
    this.segment.set('All');
    this.status.set('All');
    this.query.set('');
    this.selectedTrade.set(null);
    this.routing?.go(this.page());
  }
  clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || id;
  }
  clientActivity(c: Client) {
    return activityFor(c.id, this.start(), this.end());
  }
  openClient(c: Client) {
    this.page.set('Clients');
    this.selectedClient.set(c);
    this.detailTab.set('Overview');
    this.routing?.go('Clients', c.id);
  }
  openTrade(t: Trade) {
    this.page.set('Trade Investigation');
    this.selectedTrade.set(t);
    this.detailTab.set('Overview');
    this.routing?.go('Trade Investigation', t.id);
  }
  search() {
    this.page.set(this.role() === 'Operations' ? 'Trade Investigation' : 'Clients');
    this.selectedClient.set(null);
    this.selectedTrade.set(null);
    this.routing?.go(this.page());
  }
  percent(value: number, total: number) {
    return total ? (value / total) * 100 : 0;
  }
  compactMoney(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  exportReport(name = this.reportType()) {
    if (this.dateError()) {
      this.notice.set(this.dateError());
      return;
    }
    let data: unknown[][];
    if (name === 'Client Activity Summary') {
      data = [
        ['Client ID', 'Client', 'Portfolio segment', 'Activity', 'Joined'],
        ...this.clientRows().map((c) => [
          c.id,
          c.name,
          c.segment,
          this.clientActivity(c),
          c.joined,
        ]),
      ];
    } else if (name === 'Monthly Executive Report') {
      data = [
        ['Metric', 'Value'],
        ['Filled notional USD', this.totals().volume],
        ['Orders', this.totals().orders],
        ['Filled orders', this.totals().fills],
        ['Active trading clients', this.totals().active],
        ['New clients', this.newClients()],
      ];
    } else {
      data = [
        [
          'Order ID',
          'Client ID',
          'Instrument',
          'Class',
          'Side',
          'Quantity',
          'Price USD',
          'Status',
          'Submitted UTC',
        ],
        ...this.rows().map((t) => [
          t.id,
          t.clientId,
          t.symbol,
          t.asset,
          t.side,
          t.quantity,
          t.price,
          t.status,
          t.submitted,
        ]),
      ];
    }
    const csv = [
      ['Report', name],
      ['Period', this.start(), this.end()],
      ['Instrument class', this.asset(), 'Market', this.market(), 'Segment', this.segment()],
      ...data,
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    const report = { name, at: new Date(), rows: data.length - 1, csv };
    this.exports.update((list) => [report, ...list]);
    this.download(report);
    this.notice.set('CSV generated using the current filters.');
  }
  download(report: { name: string; csv: string }) {
    const url = URL.createObjectURL(
      new Blob(['\ufeff' + report.csv], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = report.name.toLowerCase().replaceAll(' ', '-') + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  readonly rules = [
    {
      title: 'Age eligibility',
      detail: 'Clients must meet the age requirements applicable to their account.',
    },
    {
      title: 'Tax identification',
      detail:
        'A valid Social Security number (SSN) or applicable taxpayer identification number (TIN) is required.',
    },
    {
      title: 'Identity and contact',
      detail: 'Legal name, date of birth, residential and mailing addresses, phone and email.',
    },
    {
      title: 'Financial profile',
      detail: 'Income, net worth, liquid net worth, investment objectives and risk tolerance.',
    },
    {
      title: 'Funding and ownership',
      detail:
        'Acceptable source of funds and identification of the true owner. Restrictions depend on the approved workflow.',
    },
    {
      title: 'Margin and options',
      detail: 'Margin and options trading require separate approval.',
    },
  ];
}
