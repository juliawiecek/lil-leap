import { Router } from '@angular/router';
import { AuthClient } from './auth-api.js';
import { SessionKeeper } from './session-keeper.js';

/** Owns the tab's idle timer and one restoration request, shared by startup and guards. */
export class SessionCoordinator {
  readonly auth: AuthClient;
  private readonly router: Router | null;
  readonly keeper: SessionKeeper;
  private ready: Promise<boolean> | null = null;
  private initialized = false;
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
    this.keeper = new SessionKeeper(auth, () => this.toLogin(), {
      onActivity: (at) => auth.recordActivity?.(at),
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
    return !!this.auth.accessToken && this.requiredRoles.includes(this.auth.userRole ?? '');
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
  get running(): boolean {
    return this.keeper.running;
  }
  async logout(): Promise<void> {
    this.stop();
    await this.auth.logout();
  }
  private toLogin(): void {
    if (!this.initialized) {
      return;
    }
    const returnUrl = this.returnUrl(this.router?.url ?? '');
    if (this.router && !this.router.url.startsWith('/login')) {
      void this.router.navigate(['/login'], {
        queryParams: returnUrl ? { returnUrl } : {},
        replaceUrl: true,
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
