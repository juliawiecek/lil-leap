import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { AccountsClient, AccountSummary, OpenedAccount, TransferResult, pickAccount } from './accounts-api';

/** Browser key for the last account the client picked; only an id, never balances or names. */
export const SELECTED_ACCOUNT_KEY = 'nexttrade-selected-account';

/**
 * The client's accounts and which one the dashboards show (PS-05). Holdings, cash, orders and
 * history all follow {@link selected}; listeners hear when it changes or its cash moves.
 */
@Injectable({ providedIn: 'root' })
export class AccountsService {
  client = new AccountsClient(inject(AuthService, { optional: true }) ?? { accessToken: null });
  readonly accounts = signal<AccountSummary[]>([]);
  readonly #preferredId = signal<string | null>(readStoredId());
  readonly selected = computed(() => pickAccount(this.accounts(), this.#preferredId()));
  readonly #listeners = new Set<() => void>();

  /** Reloads the account list from the server. */
  async refresh(): Promise<void> {
    this.use(await this.client.list());
  }

  /** Shows an account list loaded elsewhere, such as by the order ticket. */
  use(accounts: AccountSummary[]): void {
    const before = this.selected()?.account_id;
    this.accounts.set(accounts);
    if (this.selected()?.account_id !== before) {
      this.#notify();
    }
  }

  /** Switches every view to the account and remembers it in this browser. */
  select(accountId: string): void {
    if (accountId === this.selected()?.account_id) {
      return;
    }
    this.#preferredId.set(accountId);
    storeId(accountId);
    this.#notify();
  }

  /** Opens an account, reloads the list and switches to it. */
  async open(nickname: string): Promise<OpenedAccount> {
    const opened = await this.client.open(nickname);
    await this.refresh();
    this.select(opened.accountId);
    return opened;
  }

  /** Moves cash, then reloads balances everywhere. */
  async transfer(fromAccountId: string, toAccountId: string, amount: number): Promise<TransferResult> {
    const result = await this.client.transfer(fromAccountId, toAccountId, amount);
    await this.refresh();
    this.#notify();
    return result;
  }

  /** Calls the listener whenever the selected account changes or cash moves; returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

// Storage can be missing or blocked (private windows, tests); the choice is then just not remembered.
function readStoredId(): string | null {
  try {
    return globalThis.localStorage?.getItem(SELECTED_ACCOUNT_KEY) ?? null;
  } catch {
    return null;
  }
}

function storeId(accountId: string): void {
  try {
    globalThis.localStorage?.setItem(SELECTED_ACCOUNT_KEY, accountId);
  } catch {
    // Not remembered across reloads; the switch itself still applies.
  }
}
