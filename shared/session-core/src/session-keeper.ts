/**
 * BR-03 inactivity timeout on the client. The server ends a session that goes
 * SESSION_INACTIVITY_MINUTES without a refresh; this keeps an active user's
 * session alive by refreshing shortly before the access token expires, and
 * signs an idle user out on time instead of on their next request.
 *
 * PS-30 (WCAG 2.2.1): a minute before that sign-out the keeper raises a warning with a
 * countdown, so someone listening to the briefing or scanning slowly with a switch can ask
 * for more time instead of losing their place.
 */

/** Must match Identity (default 10); rationale: docs/architecture/ADR-NEXT-253-authentication-policy.md. */
export const SESSION_INACTIVITY_MINUTES = 10;
/** How long before the inactivity sign-out the "Still there?" warning appears (PS-30). */
export const SESSION_WARNING_SECONDS = 60;
/** The sign-in page's `reason` query value after an inactivity sign-out. */
export const INACTIVITY_SIGN_OUT = 'inactive';

/** What the sign-in page says about why the user is there, or '' for an ordinary visit. */
export function signedOutMessage(reason: string | null | undefined): string {
  return reason === INACTIVITY_SIGN_OUT
    ? `You were signed out after ${SESSION_INACTIVITY_MINUTES} minutes of inactivity. Please sign in again.`
    : '';
}

export interface SessionClient {
  readonly accessTokenExpiresAt: number | null;
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

export interface SessionKeeperOptions {
  inactivityMs?: number;
  onActivity?: (at: number) => void;
  /** Warn this long before the inactivity sign-out. */
  warningMs?: number;
  /**
   * Whole seconds left while the warning is up (called again each time the number changes),
   * then null once it is answered or the session ends.
   */
  onWarning?: (secondsLeft: number | null) => void;
  /** Refresh this long before the access token expires. */
  refreshAheadMs?: number;
  checkEveryMs?: number;
  now?: () => number;
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export class SessionKeeper {
  readonly #client: SessionClient;
  readonly #onExpired: () => void;
  readonly #inactivityMs: number;
  readonly #warningMs: number;
  readonly #refreshAheadMs: number;
  readonly #checkEveryMs: number;
  readonly #onActivity: (at: number) => void;
  readonly #onWarning: (secondsLeft: number | null) => void;
  readonly #now: () => number;
  readonly #setInterval: (callback: () => void, ms: number) => unknown;
  readonly #clearInterval: (handle: unknown) => void;
  #timer: unknown = null;
  #lastActivity = 0;
  #lastRefresh = 0;
  #refreshing = false;
  #epoch = 0;
  #secondsLeft: number | null = null;

  constructor(client: SessionClient, onExpired: () => void, options: SessionKeeperOptions = {}) {
    this.#client = client;
    this.#onActivity =
      options.onActivity ??
      (() => {
        /* The request failure is already handled locally. */
      });
    this.#onWarning =
      options.onWarning ??
      (() => {
        /* Without a listener there is nothing to show. */
      });
    this.#onExpired = onExpired;
    this.#inactivityMs = options.inactivityMs ?? SESSION_INACTIVITY_MINUTES * 60 * 1000;
    this.#warningMs = options.warningMs ?? SESSION_WARNING_SECONDS * 1000;
    this.#refreshAheadMs = options.refreshAheadMs ?? 60 * 1000;
    // Every second, so the warning appears on time and its countdown ticks smoothly. A check
    // is a few comparisons; the token is still only refreshed when it is about to expire.
    this.#checkEveryMs = options.checkEveryMs ?? 1000;
    this.#now = options.now ?? (() => Date.now());
    this.#setInterval = options.setInterval ?? ((callback, ms) => setInterval(callback, ms));
    this.#clearInterval =
      options.clearInterval ??
      ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  }

  get running(): boolean {
    return this.#timer !== null;
  }

  /** Whole seconds until the inactivity sign-out while the warning is up, otherwise null. */
  get secondsLeft(): number | null {
    return this.#secondsLeft;
  }

  /** Call right after sign-in. */
  start(lastActivityAt = this.#now()): void {
    this.stop();
    this.#lastActivity = lastActivityAt;
    this.#lastRefresh = this.#now();
    this.#timer = this.#setInterval(() => void this.check(), this.#checkEveryMs);
  }

  /**
   * Call on user input (clicks, keys, scrolling). Cheap enough for every event. While the
   * warning is up only an answer to it counts: a key press that moves between its buttons,
   * or a switch press that steps the scan, must not make the warning vanish mid-choice.
   */
  recordActivity(): void {
    if (this.#secondsLeft === null) {
      this.#extend();
    }
  }

  /** The warning's "Stay signed in": counts as activity and renews the token now if it is due. */
  staySignedIn(): void {
    if (this.#extend()) {
      void this.check();
    }
  }

  stop(): void {
    ++this.#epoch;
    this.#refreshing = false;
    if (this.#timer !== null) {
      this.#clearInterval(this.#timer);
    }
    this.#timer = null;
    this.#warn(null);
  }

  /** Runs on the interval; exposed for tests. */
  async check(): Promise<void> {
    if (!this.running) {
      return;
    }
    const now = this.#now();

    const leftMs = this.#inactivityMs - (now - this.#lastActivity);
    if (leftMs <= 0) {
      this.#expire();
      return;
    }
    this.#warn(leftMs <= this.#warningMs ? Math.ceil(leftMs / 1000) : null);

    if (this.#refreshing) {
      return;
    }
    const expiresAt = this.#client.accessTokenExpiresAt;
    const activeSinceRefresh = this.#lastActivity > this.#lastRefresh;
    if (expiresAt !== null && expiresAt - now > this.#refreshAheadMs) {
      return;
    }
    if (expiresAt !== null && !activeSinceRefresh && expiresAt > now) {
      return;
    }

    // Due for a refresh and the user has been active (or the token is gone/expired): renew or end.
    if (!activeSinceRefresh) {
      this.#expire();
      return;
    }
    this.#refreshing = true;
    const epoch = this.#epoch;
    try {
      await this.#client.refresh();
      if (this.running && epoch === this.#epoch) {
        this.#lastRefresh = this.#now();
      }
    } catch {
      if (epoch === this.#epoch) {
        this.#expire();
      }
    } finally {
      if (epoch === this.#epoch) {
        this.#refreshing = false;
      }
    }
  }

  /** Records activity; false when the session is not running or its deadline already passed. */
  #extend(): boolean {
    if (!this.running) {
      return false;
    }
    if (this.#now() - this.#lastActivity >= this.#inactivityMs) {
      this.#expire();
      return false;
    }
    this.#lastActivity = this.#now();
    this.#onActivity(this.#lastActivity);
    this.#warn(null);
    return true;
  }

  #warn(secondsLeft: number | null): void {
    if (secondsLeft !== this.#secondsLeft) {
      this.#secondsLeft = secondsLeft;
      this.#onWarning(secondsLeft);
    }
  }

  #expire(): void {
    if (!this.running) {
      return;
    }
    this.stop();
    // Report the inactivity before logging out: logging out also announces a plain session
    // end, and the sign-in page should explain this one.
    this.#onExpired();
    void this.#client.logout();
  }
}
