import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SessionKeeper } from './session-keeper';
import { safeReturnUrl } from './page-state';

/** Owns the tab's idle timer and one restoration request, shared by startup and guards. */
@Injectable({ providedIn: 'root' })
export class AppSessionService implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router, { optional: true });
  readonly keeper = new SessionKeeper(this.auth, () => this.toLogin(), {
    onActivity: at => this.auth.recordActivity?.(at),
  });
  private ready: Promise<boolean> | null = null;
  private initialized = false;
  private readonly invalidated = this.auth.onInvalidated?.(() => { this.keeper.stop(); this.toLogin(); });
  private readonly activity = () => this.keeper.recordActivity();
  private readonly visible = () => { if (document.visibilityState !== 'hidden') void this.keeper.check(); };
  private readonly events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  readonly requiredRole = 'ANALYST';

  constructor() {
    for (const event of this.events) document.addEventListener(event, this.activity, { passive: true });
    document.addEventListener('visibilitychange', this.visible);
    window.addEventListener('pageshow', this.visible);
  }
  get authenticated(): boolean { return !!this.auth.accessToken && this.auth.userRole === this.requiredRole; }
  initialize(): Promise<boolean> {
    return this.ready ??= this.restore().finally(() => { this.initialized = true; });
  }
  private async restore(): Promise<boolean> {
    if (!(await this.auth.restoreSession())) return false;
    if (!this.authenticated) { void this.auth.logout(); return false; }
    this.start();
    return true;
  }
  start(): void { this.keeper.start(this.auth.lastActivityAt ?? Date.now()); }
  stop(): void { this.keeper.stop(); }
  recordActivity(): void { this.keeper.recordActivity(); }
  get running(): boolean { return this.keeper.running; }
  async logout(): Promise<void> { this.stop(); await this.auth.logout(); }
  private toLogin(): void {
    if (!this.initialized) return;
    const returnUrl = safeReturnUrl(this.router?.url ?? '');
    if (this.router && !this.router.url.startsWith('/login')) {
      void this.router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : {}, replaceUrl: true });
    }
  }
  ngOnDestroy(): void {
    this.stop(); this.invalidated?.();
    for (const event of this.events) document.removeEventListener(event, this.activity);
    document.removeEventListener('visibilitychange', this.visible);
    window.removeEventListener('pageshow', this.visible);
  }
}
