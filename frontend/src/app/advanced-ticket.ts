import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import type { AdvancedDashboard } from './advanced-dashboard';
import { OrderPreset, parsePresets, riskQuantity, validPreset } from './order-presets';

@Component({
  selector: 'app-advanced-ticket',
  imports: [CurrencyPipe, DecimalPipe, DashboardIcon],
  templateUrl: './advanced-ticket.html',
  styleUrl: './advanced-ticket.scss',
})
export class AdvancedTicket {
  readonly desk = input.required<AdvancedDashboard>();
  readonly riskBudget = signal('');
  readonly presetName = signal('');
  readonly presetMessage = signal('');
  private readonly storageVersion = signal(0);
  readonly storageKey = computed(() => {
    const account = this.desk().selectedAccount()?.account_id;
    return account ? `nexttrade.orderPresets.v1.${account}` : null;
  });
  readonly presets = computed(() => {
    this.storageVersion();
    const key = this.storageKey();
    try { return key ? parsePresets(globalThis.localStorage?.getItem(key) ?? null) : []; }
    catch { return []; }
  });
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
  savePreset(): void {
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
    if (this.persist([...others, preset])) this.presetMessage.set(`Saved ${preset.name}. Saving the same name replaces it.`);
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
  deletePreset(preset: OrderPreset): void {
    if (this.persist(this.presets().filter(p => p.name !== preset.name))) this.presetMessage.set(`Removed ${preset.name}.`);
  }
  private persist(presets: OrderPreset[]): boolean {
    const key = this.storageKey();
    if (!key) { this.presetMessage.set('Select an account first.'); return false; }
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(presets));
      this.storageVersion.update(v => v + 1);
      return true;
    } catch {
      this.presetMessage.set('Browser storage is unavailable. Your preset could not be saved.');
      return false;
    }
  }
}
