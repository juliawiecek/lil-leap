/**
 * Client for the auth service. Calls relative /auth/... paths so requests stay
 * same-origin: nginx proxies them in docker-compose, proxy.conf.json under ng serve.
 * Access tokens stay in memory. A rotated refresh token and the idle deadline
 * are retained in sessionStorage so this tab can restore its session on reload.
 */

/** Tier the server assigned from the user's declared finances (JWT `trader_level` claim). */
export type TraderLevel = 'NOVICE' | 'ADVANCED';
export type RiskProfile = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';

export interface AuthUser {
  id: string;
  email: string;
  userRole: string;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  email: string;
  phone: string;
}

type RegisterRequest = Record<string, string | boolean>;

/** A failure with a fixed, user-safe message. Server bodies and raw errors are never surfaced or logged. */
export class AuthApiError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = 'AuthApiError';
    this.userMessage = userMessage;
  }
}

const SIGNED_OUT_MESSAGE = 'Your session has ended. Please sign in again.';
const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password, or sign-in is locked. After 3 failed attempts, wait 15 minutes and try again.',
  INVALID_REFRESH_TOKEN: SIGNED_OUT_MESSAGE,
  USER_ALREADY_EXISTS:
    'An account with this email already exists. Go back to sign up with a different email, or sign in.',
  INSUFFICIENT_INVESTABLE_ASSETS:
    'A minimum of $5,000 in investable assets is required to open an account. Please review your net worth and income.',
  INVALID_REQUEST: 'Some details were not accepted. Please review your information and try again.',
  INVALID_RESET_TOKEN: 'This reset link is invalid, expired or already used. Please request a new one.',
  PROFILE_ACCESS_DENIED: 'You can only view your own profile.',
  PROFILE_NOT_FOUND: 'Your profile could not be found. Please try again.',
};
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE = 'We could not reach NextTrade. Check your connection and try again.';

export interface AuthClientOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  storageKey?: string;
  now?: () => number;
  inactivityMs?: number;
  requestTimeoutMs?: number;
}

function tabStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export class AuthClient {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;
  #accessToken: string | null = null;
  #accessTokenExpiresAt: number | null = null;
  #refreshToken: string | null = null;
  #traderLevel: TraderLevel | null = null;
  #riskProfile: RiskProfile | null = null;
  #userRole: string | null = null;
  #email: string | null = null;
  #userId: string | null = null;
  #lastActivityAt: number | null = null;
  #generation = 0;
  #refreshing: Promise<void> | null = null;
  #restoring: Promise<boolean> | null = null;
  readonly #storage: AuthClientOptions['storage'];
  readonly #storageKey: string;
  readonly #now: () => number;
  readonly #inactivityMs: number;
  readonly #timeoutMs: number;
  readonly #invalidated = new Set<() => void>();

  constructor(
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    baseUrl = '/auth',
    options: AuthClientOptions = {},
  ) {
    this.#fetch = fetchImpl;
    this.#baseUrl = baseUrl;
    this.#storage = options.storage === undefined ? tabStorage() : options.storage;
    this.#storageKey = options.storageKey ?? 'nexttrade.auth.session.v1';
    this.#now = options.now ?? (() => Date.now());
    this.#inactivityMs = options.inactivityMs ?? 10 * 60 * 1000;
    this.#timeoutMs = options.requestTimeoutMs ?? 10000;
  }

  /** Bearer token for calls to the trading APIs, or null when signed out. */
  get accessToken(): string | null {
    return this.#accessToken;
  }

  /** When the access token stops being accepted, on this device's clock (ms since epoch); null when signed out. */
  get accessTokenExpiresAt(): number | null {
    return this.#accessTokenExpiresAt;
  }

  /** The signed-in user's tier from the access token; null when signed out or for a user without an account. */
  get traderLevel(): TraderLevel | null {
    return this.#traderLevel;
  }

  get userRole(): string | null {
    return this.#userRole;
  }
  get email(): string | null {
    return this.#email;
  }
  get userId(): string | null {
    return this.#userId;
  }
  get riskProfile(): RiskProfile | null {
    return this.#riskProfile;
  }
  get lastActivityAt(): number | null {
    return this.#lastActivityAt;
  }

  onInvalidated(callback: () => void): () => void {
    this.#invalidated.add(callback);
    return () => this.#invalidated.delete(callback);
  }

  /** An old request's 401 must not invalidate a newer login or token rotation. */
  unauthorized(token: string | null): void {
    if (token && token === this.#accessToken) {
      void this.logout();
    }
  }

  recordActivity(at = this.#now()): void {
    if (!this.#accessToken) {
      return;
    }
    this.#lastActivityAt = at;
    this.#persist();
  }

  restoreSession(): Promise<boolean> {
    return (this.#restoring ??= this.#restore());
  }

  async #restore(): Promise<boolean> {
    const generation = this.#generation;
    if (this.#accessToken) {
      return true;
    }
    try {
      const raw = this.#storage?.getItem(this.#storageKey);
      if (!raw) {
        return false;
      }
      const record = JSON.parse(raw);
      const at = record?.lastActivityAt;
      const validToken =
        record?.version === 1 &&
        typeof record.refreshToken === 'string' &&
        record.refreshToken.trim();
      const validTime =
        typeof at === 'number' && Number.isFinite(at) && at >= 0 && at <= this.#now();
      if (!validToken || !validTime) {
        this.#clear();
        return false;
      }
      this.#refreshToken = record.refreshToken;
      this.#lastActivityAt = at;
      if (this.#now() - at >= this.#inactivityMs) {
        void this.logout();
        return false;
      }
      await this.refresh();
      if (
        !this.#accessToken ||
        this.#lastActivityAt === null ||
        this.#now() - this.#lastActivityAt >= this.#inactivityMs
      ) {
        void this.logout();
        return false;
      }
      return true;
    } catch {
      if (generation === this.#generation) {
        this.#clear();
      }
      return false;
    }
  }

  #persist(): void {
    try {
      if (this.#refreshToken && this.#lastActivityAt !== null) {
        this.#storage?.setItem(
          this.#storageKey,
          JSON.stringify({
            version: 1,
            refreshToken: this.#refreshToken,
            lastActivityAt: this.#lastActivityAt,
          }),
        );
      } else {
        this.#storage?.removeItem(this.#storageKey);
      }
    } catch {
      /* Storage-disabled browsers can still sign in for this page lifetime. */
    }
  }

  #clear(): void {
    ++this.#generation;
    this.#lastActivityAt = null;
    this.#setTokens(null, null);
    for (const callback of this.#invalidated) {
      callback();
    }
  }

  /** Creates the account. Issues no tokens -- call login afterwards. */
  async register(request: RegisterRequest): Promise<void> {
    await this.#post('/register', request);
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const generation = ++this.#generation;
    const body = (await this.#post('/login', { email, password })) as {
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    };
    if (generation !== this.#generation) {
      void this.#post('/logout', { refreshToken: body.refreshToken }).catch(() => {
        /* The request failure is already handled locally. */
      });
      throw new AuthApiError(SIGNED_OUT_MESSAGE);
    }
    this.#lastActivityAt = this.#now();
    this.#setTokens(body.accessToken, body.refreshToken);
    this.#userId = body.user?.id ?? this.#userId;
    this.#userRole ??= body.user?.userRole ?? null;
    this.#email ??= body.user?.email ?? null;
    return body.user;
  }

  async getProfile(): Promise<UserProfile> {
    if (!this.#accessToken || !this.#userId) {
      throw new AuthApiError(SIGNED_OUT_MESSAGE);
    }
    return (await this.#get(`/users/${encodeURIComponent(this.#userId)}`)) as UserProfile;
  }

  /**
   * Swaps the refresh token for a new token pair. The server treats each refresh as
   * activity and extends the session; a session idle past its window fails, which
   * clears the tokens here too.
   */
  refresh(): Promise<void> {
    if (this.#refreshing) {
      return this.#refreshing;
    }
    const task = this.#rotate();
    this.#refreshing = task;
    void task
      .finally(() => {
        if (this.#refreshing === task) {
          this.#refreshing = null;
        }
      })
      .catch(() => {
        /* The request failure is already handled locally. */
      });
    return task;
  }

  async #rotate(): Promise<void> {
    const refreshToken = this.#refreshToken;
    const generation = this.#generation;
    if (!refreshToken) {
      throw new AuthApiError(SIGNED_OUT_MESSAGE);
    }
    try {
      const body = (await this.#post('/refresh', { refreshToken })) as {
        accessToken: string;
        refreshToken: string;
      };
      if (generation !== this.#generation) {
        void this.#post('/logout', { refreshToken: body.refreshToken }).catch(() => {
          /* The request failure is already handled locally. */
        });
        throw new AuthApiError(SIGNED_OUT_MESSAGE);
      }
      this.#setTokens(body.accessToken, body.refreshToken);
    } catch (error) {
      if (generation === this.#generation) {
        this.#clear();
      }
      throw error;
    }
  }

  /** Asks for a reset link. The server answers the same whether or not the email is registered. */
  async requestPasswordReset(email: string): Promise<void> {
    await this.#post('/forgot-password', { email });
  }

  /** Sets a new password with the token from the reset link; the server also ends every session. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.#post('/reset-password', { token, newPassword });
  }

  /** Always signs out locally; revoking the session server-side is best effort and never throws. */
  async logout(): Promise<void> {
    const refreshToken = this.#refreshToken;
    this.#clear();
    if (!refreshToken) {
      return;
    }
    try {
      await this.#post('/logout', { refreshToken });
    } catch {
      // The session still expires server-side; the user is signed out here either way.
    }
  }

  /**
   * Expiry is the token's lifetime (exp - iat) counted from now, not its absolute
   * `exp`: a device clock that's minutes off would otherwise refresh too late and
   * sign an active user out.
   */
  #setTokens(accessToken: string | null, refreshToken: string | null): void {
    this.#accessToken = accessToken;
    this.#refreshToken = refreshToken;
    this.#accessTokenExpiresAt = null;
    this.#traderLevel = null;
    this.#riskProfile = this.#userRole = this.#email = this.#userId = null;
    this.#persist();
    const payload = accessToken?.split('.')[1];
    if (!payload) {
      return;
    }
    try {
      const { exp, iat, sub, trader_level, risk_profile, user_role, email } = JSON.parse(
        atob(payload.replaceAll('-', '+').replaceAll('_', '/')),
      ) as {
        exp?: unknown;
        iat?: unknown;
        trader_level?: unknown;
        risk_profile?: unknown;
        user_role?: unknown;
        email?: unknown;
        sub?: unknown;
      };
      if (typeof exp === 'number' && typeof iat === 'number') {
        this.#accessTokenExpiresAt = this.#now() + (exp - iat) * 1000;
      }
      this.#userRole = typeof user_role === 'string' ? user_role : null;
      this.#email = typeof email === 'string' ? email : null;
      this.#userId = typeof sub === 'string' ? sub : null;
      this.#riskProfile =
        risk_profile === 'CONSERVATIVE' ||
        risk_profile === 'MODERATE' ||
        risk_profile === 'AGGRESSIVE'
          ? risk_profile
          : null;
      if (trader_level === 'NOVICE' || trader_level === 'ADVANCED') {
        this.#traderLevel = trader_level;
      }
    } catch {
      // Unreadable token: leave expiry unknown, which makes the session keeper refresh on next activity.
    }
  }

  async #post(path: string, body: object): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AuthApiError(NETWORK_MESSAGE));
      }, this.#timeoutMs);
    });
    try {
      return await Promise.race([this.#request(path, body, controller.signal, 'POST'), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  async #get(path: string): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AuthApiError(NETWORK_MESSAGE));
      }, this.#timeoutMs);
    });
    try {
      return await Promise.race([this.#request(path, undefined, controller.signal, 'GET'), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  async #request(path: string, body: object | undefined, signal: AbortSignal, method: 'GET' | 'POST'): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(this.#baseUrl + path, {
        method,
        signal,
        headers: method === 'GET' ? { Authorization: `Bearer ${this.#accessToken}` } : { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new AuthApiError(NETWORK_MESSAGE);
    }

    if (response.ok) {
      // 202 Accepted (forgot-password) and 204 No Content carry no body.
      return response.status === 202 || response.status === 204 ? undefined : response.json();
    }

    const code = await response
      .json()
      .then((error: { error?: unknown }) => (typeof error?.error === 'string' ? error.error : ''))
      .catch(() => '');
    throw new AuthApiError(MESSAGES[code] ?? FALLBACK_MESSAGE);
  }
}
