import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthClient } from './auth-api.js';
import { INACTIVITY_SIGN_OUT, SessionKeeper } from './session-keeper.js';

/** Owns the tab's idle timer and one restoration request, shared by startup and guards. */
export class SessionCoordinator {
  readonly auth: AuthClient;
  private readonly router: Router | null;
  readonly keeper: SessionKeeper;
  /** Seconds left before the inactivity sign-out while the "Still there?" warning is up (PS-30). */
  readonly warningSecondsLeft = signal<number | null>(null);
  private ready: Promise<boolean> | null = null;
  private initialized = false;
  /** Set while a redirect to sign-in is under way, so a second cause cannot replace the first. */
  private redirecting = false;
  private readonly invalidated: (() => void) | undefined;
  private readonly activity = () => this.keeper.recordActivity();
  private readonly visible = () => {
    if (document.visibilityState !== 'hidden') {
      void this.keeper.check();
    }
  };
  private readonly events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  /** Roles allowed into this app, e.g. Insights admits both ANALYST and OPERATIONS staff. */
  readonly requiredRoles: readonly string[];
  private readonly returnUrl: (value: string) => string | null;

  constructor(
    auth: AuthClient,
    router: Router | null,
    role: string | readonly string[],
    returnUrl: (value: string) => string | null,
  ) {
    this.auth = auth;
    this.router = router;
    this.requiredRoles = typeof role === 'string' ? [role] : [...role];
    this.returnUrl = returnUrl;
    this.keeper = new SessionKeeper(auth, () => this.toLogin(INACTIVITY_SIGN_OUT), {
      onActivity: (at) => auth.recordActivity?.(at),
      onWarning: (secondsLeft) => this.warningSecondsLeft.set(secondsLeft),
    });
    this.invalidated = auth.onInvalidated?.(() => {
      this.keeper.stop();
      this.toLogin();
    });
    for (const event of this.events) {
      document.addEventListener(event, this.activity, { passive: true });
    }
    document.addEventListener('visibilitychange', this.visible);
    window.addEventListener('pageshow', this.visible);
  }
  get authenticated(): boolean {
    if (!this.auth.accessToken || !this.requiredRoles.includes(this.auth.userRole ?? '')) {
      return false;
    }
    const expiresAt = this.auth.accessTokenExpiresAt;
    return expiresAt !== null && Number.isFinite(expiresAt) && expiresAt > Date.now();
  }
  initialize(): Promise<boolean> {
    return (this.ready ??= this.restore().finally(() => {
      this.initialized = true;
    }));
  }
  private async restore(): Promise<boolean> {
    if (!(await this.auth.restoreSession())) {
      return false;
    }
    if (!this.authenticated) {
      void this.auth.logout();
      return false;
    }
    this.start();
    return true;
  }
  start(): void {
    this.keeper.start(this.auth.lastActivityAt ?? Date.now());
  }
  stop(): void {
    this.keeper.stop();
  }
  recordActivity(): void {
    this.keeper.recordActivity();
  }
  /** The warning's "Stay signed in". */
  staySignedIn(): void {
    this.keeper.staySignedIn();
  }
  get running(): boolean {
    return this.keeper.running;
  }
  async logout(): Promise<void> {
    this.stop();
    await this.auth.logout();
  }
  /** `reason` tells the sign-in page why the user is back there (see signedOutMessage). */
  private toLogin(reason?: string): void {
    if (!this.initialized || this.redirecting) {
      return;
    }
    const returnUrl = this.returnUrl(this.router?.url ?? '');
    if (this.router && !this.router.url.startsWith('/login')) {
      this.redirecting = true;
      void this.router
        .navigate(['/login'], {
          queryParams: { ...(returnUrl ? { returnUrl } : {}), ...(reason ? { reason } : {}) },
          replaceUrl: true,
        })
        .finally(() => {
          this.redirecting = false;
        });
    }
  }
  destroy(): void {
    this.stop();
    this.invalidated?.();
    for (const event of this.events) {
      document.removeEventListener(event, this.activity);
    }
    document.removeEventListener('visibilitychange', this.visible);
    window.removeEventListener('pageshow', this.visible);
  }
}
