/**
 * BR-03 inactivity timeout on the client. The server ends a session that goes
 * SESSION_INACTIVITY_MINUTES without a refresh; this keeps an active user's
 * session alive by refreshing shortly before the access token expires, and
 * signs an idle user out on time instead of on their next request.
 */

/** Must match the auth service's SESSION_INACTIVITY_MINUTES (default 10). */
export const SESSION_INACTIVITY_MINUTES = 10;

export interface SessionClient {
  readonly accessTokenExpiresAt: number | null;
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

export interface SessionKeeperOptions {
  inactivityMs?: number;
  /** Refresh this long before the access token expires. */
  refreshAheadMs?: number;
  checkEveryMs?: number;
  now?: () => number;
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export class SessionKeeper {
  #client: SessionClient;
  #onExpired: () => void;
  #inactivityMs: number;
  #refreshAheadMs: number;
  #checkEveryMs: number;
  #now: () => number;
  #setInterval: (callback: () => void, ms: number) => unknown;
  #clearInterval: (handle: unknown) => void;
  #timer: unknown = null;
  #lastActivity = 0;
  #lastRefresh = 0;
  #refreshing = false;

  constructor(client: SessionClient, onExpired: () => void, options: SessionKeeperOptions = {}) {
    this.#client = client;
    this.#onExpired = onExpired;
    this.#inactivityMs = options.inactivityMs ?? SESSION_INACTIVITY_MINUTES * 60 * 1000;
    this.#refreshAheadMs = options.refreshAheadMs ?? 60 * 1000;
    this.#checkEveryMs = options.checkEveryMs ?? 15 * 1000;
    this.#now = options.now ?? (() => Date.now());
    this.#setInterval = options.setInterval ?? ((callback, ms) => setInterval(callback, ms));
    this.#clearInterval = options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  }

  get running(): boolean {
    return this.#timer !== null;
  }

  /** Call right after sign-in. */
  start(): void {
    this.stop();
    this.#lastActivity = this.#lastRefresh = this.#now();
    this.#timer = this.#setInterval(() => void this.check(), this.#checkEveryMs);
  }

  /** Call on user input (clicks, keys, scrolling). Cheap enough for every event. */
  recordActivity(): void {
    if (this.running) this.#lastActivity = this.#now();
  }

  stop(): void {
    if (this.#timer !== null) this.#clearInterval(this.#timer);
    this.#timer = null;
  }

  /** Runs on the interval; exposed for tests. */
  async check(): Promise<void> {
    if (!this.running || this.#refreshing) return;
    const now = this.#now();

    if (now - this.#lastActivity >= this.#inactivityMs) {
      this.#expire();
      return;
    }

    const expiresAt = this.#client.accessTokenExpiresAt;
    const activeSinceRefresh = this.#lastActivity > this.#lastRefresh;
    if (expiresAt !== null && expiresAt - now > this.#refreshAheadMs) return;
    if (expiresAt !== null && !activeSinceRefresh && expiresAt > now) return;

    // Due for a refresh and the user has been active (or the token is gone/expired): renew or end.
    if (!activeSinceRefresh) {
      this.#expire();
      return;
    }
    this.#refreshing = true;
    try {
      await this.#client.refresh();
      this.#lastRefresh = this.#now();
    } catch {
      this.#expire();
    } finally {
      this.#refreshing = false;
    }
  }

  #expire(): void {
    if (!this.running) return;
    this.stop();
    void this.#client.logout();
    this.#onExpired();
  }
}
