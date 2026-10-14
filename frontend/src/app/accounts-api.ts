/**
 * Client for the caller's accounts on the Holdings service (PS-05): list them, open another one,
 * and move cash between them. Every call is scoped by the access token's user on the server.
 */
import type { AccessTokenSource } from './order-history-api';
import type { Account } from './order-submission-api';

/** An account as listed by GET /accounts; the PS-05 fields are optional so older fakes still fit. */
export interface AccountSummary extends Account {
  account_type?: string;
  currency?: string;
  /** Settled cash minus open holds: what can be traded or transferred now. */
  available_cash?: number | string;
  created_at?: string;
}

export interface OpenedAccount {
  accountId: string;
  accountNumber: string;
  nickname: string;
  accountType: string;
  currency: string;
  status: string;
  tradingEnabled: boolean;
  cashBalance: number;
  createdAt: string;
}

export interface TransferResult {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fromBalance: number;
  toBalance: number;
  transferredAt: string;
}

/** Most accounts a client can hold; the server enforces the same limit. */
export const MAX_ACCOUNTS = 10;

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'That is more than the available cash in the account you are moving it from.',
  ACCOUNT_ACCESS_DENIED: 'You can only move cash between your own accounts.',
  SAME_ACCOUNT: 'Choose two different accounts.',
  ACCOUNT_UNAVAILABLE: 'One of these accounts is not open for transfers.',
  ACCOUNT_LIMIT_REACHED: `You already have the maximum of ${MAX_ACCOUNTS} accounts.`,
  INVALID_REQUEST: 'Please check the details and try again.',
};
const FALLBACK = 'Something went wrong. Please try again.';
const NETWORK = 'Could not reach the server. Check your connection and try again.';

/** "Growth Portfolio ••7734": the nickname plus the last four characters of the account number. */
export function accountLabel(account: Pick<Account, 'account_name' | 'account_number'>): string {
  return `${account.account_name} ••${(account.account_number ?? '').slice(-4)}`;
}

/** Whether orders can be placed from the account. */
export function canTrade(account: Account | null | undefined): boolean {
  return account?.account_status === 'ACTIVE' && account.trading_enabled === true;
}

/**
 * The account the dashboards work with: the client's last choice while it still exists, otherwise
 * their first account that can trade, otherwise their first account.
 */
export function pickAccount<T extends Account>(accounts: readonly T[], preferredId: string | null): T | null {
  return accounts.find((a) => a.account_id === preferredId) ?? accounts.find(canTrade) ?? accounts[0] ?? null;
}

export class AccountsClient {
  readonly #tokens: AccessTokenSource;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(
    tokens: AccessTokenSource,
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    baseUrl = '/api/v1',
  ) {
    this.#tokens = tokens;
    this.#fetch = fetchImpl;
    this.#baseUrl = baseUrl;
  }

  /** The caller's accounts, oldest first. */
  list(): Promise<AccountSummary[]> {
    return this.#request<AccountSummary[]>('GET', '/accounts');
  }

  /** Opens an ACTIVE individual cash account in USD with no cash. */
  open(nickname: string): Promise<OpenedAccount> {
    return this.#request<OpenedAccount>('POST', '/accounts', { nickname: nickname.trim() });
  }

  /** Moves settled cash between two of the caller's accounts. */
  transfer(fromAccountId: string, toAccountId: string, amount: number): Promise<TransferResult> {
    return this.#request<TransferResult>('POST', '/accounts/transfers', { fromAccountId, toAccountId, amount });
  }

  async #request<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new Error('Sign in to manage your accounts.');
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, { method, headers, body: body && JSON.stringify(body) });
    } catch {
      throw new Error(NETWORK);
    }
    if (response.status === 401) {
      this.#tokens.unauthorized?.(token);
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: unknown } | null;
      throw new Error((typeof error?.error === 'string' && MESSAGES[error.error]) || FALLBACK);
    }
    return (await response.json()) as T;
  }
}
