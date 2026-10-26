import { PriceFlash } from './price-flash';
import { ApiHttpClient } from '@lilleap/session-core/angular';
import { firstValueFrom } from 'rxjs';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import type { AdvancedDashboard } from './advanced-dashboard';
import { OrderPreset, riskQuantity, validPreset } from './order-presets';

@Component({
  selector: 'app-advanced-ticket',
  imports: [CurrencyPipe, DecimalPipe, DashboardIcon, PriceFlash],
  templateUrl: './advanced-ticket.html',
  styleUrl: './advanced-ticket.scss',
})
export class AdvancedTicket {
  readonly desk = input.required<AdvancedDashboard>();
  readonly riskBudget = signal('');
  readonly presetName = signal('');
  readonly presetMessage = signal('');
  private readonly http = inject(ApiHttpClient);
  readonly presets = signal<OrderPreset[]>([]);
  readonly presetLoading = signal(false);
  readonly presetBusy = signal(false);
  readonly presetLoadError = signal(false);
  readonly storageKey = computed(() => this.desk().selectedAccount()?.account_id ?? null);
  private requestVersion = 0;
  constructor() {
    effect(() => { void this.loadPresets(this.storageKey()); });
  }
  async loadPresets(account = this.storageKey()): Promise<void> {
    const version = ++this.requestVersion;
    this.presets.set([]);
    this.presetMessage.set('');
    this.presetLoadError.set(false);
    if (!account) { this.presetLoading.set(false); return; }
    this.presetLoading.set(true);
    try {
      const presets = await firstValueFrom(this.http.get<OrderPreset[]>(`/api/v1/orders/presets?accountId=${encodeURIComponent(account)}`));
      if (version === this.requestVersion && account === this.storageKey()) this.presets.set(presets);
    } catch {
      if (version === this.requestVersion && account === this.storageKey()) {
        this.presetLoadError.set(true);
        this.presetMessage.set('Could not load saved presets. Please retry.');
      }
    } finally { if (version === this.requestVersion) this.presetLoading.set(false); }
  }
  readonly capacity = computed(() => {
    const d = this.desk();
    if (!d.portfolioLoaded()) return 0;
    if (d.side() === 'Sell') return d.positions().find(p => p.symbol === d.selected().symbol)?.quantity ?? 0;
    const price = d.entryPrice() * (d.orderType() === 'MARKET' ? 1 + d.tolerance() / 100 : 1);
    return price > 0 ? Math.max(0, Math.floor(d.buyingPower() / price)) : 0;
  });
  readonly sizingBlockReason = computed(() => {
    const d = this.desk();
    const entry = d.entryPrice(), stop = d.exitPrice('loss'), budget = Number(this.riskBudget());
    if (!d.stopLossEnabled()) return 'Turn on Stop loss above to enable risk-based sizing.';
    if (!d.stopLoss().trim() || !Number.isFinite(Number(d.stopLoss())) || Number(d.stopLoss()) <= 0)
      return 'Enter a stop-loss price or percentage above.';
    if (!Number.isFinite(entry) || entry <= 0) return d.orderType() === 'LIMIT' ? 'Enter a limit price greater than zero.' : 'Waiting for an entry price.';
    if (!Number.isFinite(stop) || stop <= 0) return 'The stop must resolve to a price greater than zero. Check the price/percentage setting.';
    if (d.side() === 'Buy' ? stop >= entry : stop <= entry)
      return `For ${d.side()}, the stop-loss price must be ${d.side() === 'Buy' ? 'below' : 'above'} the entry price of $${entry.toFixed(2)}.`;
    if (!Number.isFinite(budget) || budget <= 0) return 'Enter a risk budget greater than zero in USD.';
    const perShare = Math.abs(entry - stop);
    if (budget < perShare) return `Your risk budget is less than the $${perShare.toFixed(2)} estimated risk for one share.`;
    if (d.priceDelayed()) return 'The quote is over a minute old. Apply will unlock when a fresh quote arrives.';
    if (!d.ticketQuote()) return 'Waiting for a valid bid and ask.';
    if (!d.portfolioLoaded()) return 'Waiting for account balances.';
    if (!Number.isFinite(this.capacity()) || this.capacity() < 1) return d.side() === 'Buy'
      ? 'Available buying power cannot cover one share at this entry price, including market price protection.'
      : `You do not hold any ${d.selected().symbol} shares available to sell.`;
    return '';
  });
  readonly suggestedQuantity = computed(() => {
    const d = this.desk();
    return this.sizingBlockReason() ? 0
      : riskQuantity(Number(this.riskBudget()), d.entryPrice(), d.exitPrice('loss'), d.side(), this.capacity());
  });
  readonly sizingNote = computed(() => this.sizingBlockReason()
    || 'Rounded down and capped by available cash or shares. Apply to update quantity; it will not auto-adjust as prices move.');
  applyRiskSize(): void {
    const shares = this.suggestedQuantity();
    if (shares > 0) {
      this.desk().quantity.set(String(shares));
      this.desk().message.set('');
    }
  }
  async savePreset(): Promise<void> {
    const d = this.desk(), entry = d.entryPrice();
    const distance = (kind: 'profit' | 'loss') => {
      const price = d.exitPrice(kind);
      const above = (d.side() === 'Buy') === (kind === 'profit');
      if (entry <= 0 || price <= 0 || (above ? price <= entry : price >= entry)) return NaN;
      return Math.round(Math.abs(price - entry) / entry * 1000000) / 10000;
    };
    const preset: OrderPreset = {
      name: this.presetName().trim(), orderType: d.orderType(), quantity: Number(d.quantity()), tolerance: d.tolerance(),
      profitPercent: d.takeProfitEnabled() ? distance('profit') : null,
      stopPercent: d.stopLossEnabled() ? distance('loss') : null,
      riskBudget: this.riskBudget() ? Number(this.riskBudget()) : null,
    };
    if (!validPreset(preset)) {
      this.presetMessage.set('Enter a name, whole-share quantity and valid settings. Reusable exit distances must be between 0% and 100%.');
      return;
    }
    const others = this.presets().filter(p => p.name !== preset.name);
    if (others.length >= 10) { this.presetMessage.set('You can save up to 10 presets. Remove one first.'); return; }
    await this.persist(preset);
  }
  applyPreset(preset: OrderPreset): void {
    const d = this.desk();
    d.setOrderType(preset.orderType);
    if (preset.orderType === 'LIMIT') d.limitPrice.set(d.marketEntryPrice() > 0 ? d.marketEntryPrice().toFixed(2) : '');
    d.quantity.set(String(preset.quantity));
    d.orderTolerance.set(preset.tolerance);
    d.exitUnit.set('percent');
    d.takeProfitEnabled.set(preset.profitPercent !== null);
    d.stopLossEnabled.set(preset.stopPercent !== null);
    d.takeProfit.set(preset.profitPercent === null ? '' : String(preset.profitPercent));
    d.stopLoss.set(preset.stopPercent === null ? '' : String(preset.stopPercent));
    this.riskBudget.set(preset.riskBudget === null ? '' : String(preset.riskBudget));
    this.presetName.set(preset.name);
    this.presetMessage.set(`Applied ${preset.name}. Review the current prices and quantity before submitting.`);
    d.message.set('');
  }
  async deletePreset(preset: OrderPreset): Promise<void> {
    await this.persist(preset, true);
  }
  private async persist(preset: OrderPreset, remove = false): Promise<void> {
    const account = this.storageKey();
    if (!account || this.presetBusy() || this.presetLoading() || this.presetLoadError()) return;
    this.presetBusy.set(true);
    this.presetMessage.set('');
    try {
      const url = `/api/v1/orders/presets?accountId=${encodeURIComponent(account)}`;
      const presets = await firstValueFrom(remove
        ? this.http.delete<OrderPreset[]>(`${url}&name=${encodeURIComponent(preset.name)}`)
        : this.http.put<OrderPreset[]>(url, preset));
      if (account === this.storageKey()) {
        this.presets.set(presets);
        this.presetMessage.set(remove ? `Removed ${preset.name}.` : `Saved ${preset.name} to your account.`);
      }
    } catch {
      if (account === this.storageKey()) this.presetMessage.set('Could not update presets. Please retry. You can save up to 10 per account.');
    } finally { this.presetBusy.set(false); }
  }
}
