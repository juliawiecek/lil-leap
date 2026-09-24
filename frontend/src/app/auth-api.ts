/**
 * Client for the auth service. Calls relative /auth/... paths so requests stay
 * same-origin: nginx proxies them in docker-compose, proxy.conf.json under ng serve.
 * Tokens live only in memory -- never localStorage -- so a reload signs the user out.
 */

export interface AuthUser {
  id: string;
  email: string;
  userRole: string;
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
  INVALID_CREDENTIALS: 'Invalid email or password.',
  INVALID_REFRESH_TOKEN: SIGNED_OUT_MESSAGE,
  USER_ALREADY_EXISTS: 'An account with this email already exists. Go back to sign up with a different email, or sign in.',
  INVALID_REQUEST: 'Some details were not accepted. Please review your information and try again.',
};
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE = 'We could not reach NextTrade. Check your connection and try again.';

export class AuthClient {
  #fetch: typeof fetch;
  #baseUrl: string;
  #accessToken: string | null = null;
  #accessTokenExpiresAt: number | null = null;
  #refreshToken: string | null = null;

  constructor(fetchImpl: typeof fetch = (input, init) => fetch(input, init), baseUrl = '/auth') {
    this.#fetch = fetchImpl;
    this.#baseUrl = baseUrl;
  }

  /** Bearer token for calls to the trading APIs, or null when signed out. */
  get accessToken(): string | null {
    return this.#accessToken;
  }

  /** When the access token stops being accepted, on this device's clock (ms since epoch); null when signed out. */
  get accessTokenExpiresAt(): number | null {
    return this.#accessTokenExpiresAt;
  }

  /** Creates the account. Issues no tokens -- call login afterwards. */
  async register(request: RegisterRequest): Promise<void> {
    await this.#post('/register', request);
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const body = (await this.#post('/login', { email, password })) as {
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    };
    this.#setTokens(body.accessToken, body.refreshToken);
    return body.user;
  }

  /**
   * Swaps the refresh token for a new token pair. The server treats each refresh as
   * activity and extends the session; a session idle past its window fails, which
   * clears the tokens here too.
   */
  async refresh(): Promise<void> {
    const refreshToken = this.#refreshToken;
    if (!refreshToken) throw new AuthApiError(SIGNED_OUT_MESSAGE);
    try {
      const body = (await this.#post('/refresh', { refreshToken })) as { accessToken: string; refreshToken: string };
      this.#setTokens(body.accessToken, body.refreshToken);
    } catch (error) {
      this.#setTokens(null, null);
      throw error;
    }
  }

  /** Always signs out locally; revoking the session server-side is best effort and never throws. */
  async logout(): Promise<void> {
    const refreshToken = this.#refreshToken;
    this.#setTokens(null, null);
    if (!refreshToken) return;
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
    const payload = accessToken?.split('.')[1];
    if (!payload) return;
    try {
      const { exp, iat } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown; iat?: unknown };
      if (typeof exp === 'number' && typeof iat === 'number') this.#accessTokenExpiresAt = Date.now() + (exp - iat) * 1000;
    } catch {
      // Unreadable token: leave expiry unknown, which makes the session keeper refresh on next activity.
    }
  }

  async #post(path: string, body: object): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(this.#baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthApiError(NETWORK_MESSAGE);
    }

    if (response.ok) {
      return response.status === 204 ? undefined : response.json();
    }

    const code = await response
      .json()
      .then((error: { error?: unknown }) => (typeof error?.error === 'string' ? error.error : ''))
      .catch(() => '');
    throw new AuthApiError(MESSAGES[code] ?? FALLBACK_MESSAGE);
  }
}
