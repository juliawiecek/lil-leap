import { Injectable, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthClient, type AuthUser } from '../../../frontend-shared/auth-api.ts';
import { SessionKeeper } from '../../../frontend-shared/session-keeper.ts';
import { angularTransport } from './http-transport';

/** One in-memory session and intercepted HTTP transport per application. */
@Injectable({ providedIn: 'root' })
export class AuthService extends AuthClient implements OnDestroy {
  readonly session: SessionKeeper;
  private readonly router = inject(Router, { optional: true });
  private endingSession = false;

  constructor() {
    const http = inject(HttpClient, { optional: true });
    super(http ? angularTransport(http) : undefined);
    this.session = new SessionKeeper(this, () => this.endSession());
  }

  ngOnDestroy(): void { this.session.stop(); }

  override async login(email: string, password: string): Promise<AuthUser> {
    const user = await super.login(email, password);
    this.endingSession = false;
    this.session.start();
    return user;
  }

  override async logout(): Promise<void> {
    this.session.stop();
    await super.logout();
  }

  /** Synchronous clearing ensures concurrent 401s cannot keep protected content open. */
  endSession(): void {
    if (this.endingSession) return;
    this.endingSession = true;
    void this.logout();
    void this.router?.navigate(['/login'], { queryParams: { expired: '1' }, replaceUrl: true });
  }
}
