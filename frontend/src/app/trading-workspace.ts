import { Component, inject, OnInit, signal } from '@angular/core';
import { StockDashboard } from './stock-dashboard';
import { AuthService } from './auth.service';
import { AppSessionService } from './app-session.service';
import type { UserProfile } from './auth-api';
@Component({ selector: 'app-trading-workspace', imports: [StockDashboard], styles: [':host { display:block; min-height:100vh; }'],
  template: `<app-stock-dashboard [name]="auth.email ?? ''" [level]="auth.traderLevel ?? 'NOVICE'" [profile]="profile()" [profileLoading]="profileLoading()" [profileError]="profileError()" (signOut)="session.logout()" />` })
export class TradingWorkspace implements OnInit {
  readonly auth = inject(AuthService);
  readonly session = inject(AppSessionService);
  readonly profile = signal<UserProfile | null>(null);
  readonly profileLoading = signal(true);
  readonly profileError = signal('');

  ngOnInit(): void {
    void this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    try {
      const accessToken = this.auth.accessToken;
      const userId = this.userIdFromToken(accessToken);
      if (!accessToken || !userId) {
        throw new Error('Your profile could not be loaded. Please sign in again.');
      }

      const response = await fetch(`/auth/users/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error('Your profile could not be loaded. Please try again.');
      }
      this.profile.set((await response.json()) as UserProfile);
    } catch (error) {
      this.profileError.set(error instanceof Error ? error.message : 'Profile details could not be loaded.');
    } finally {
      this.profileLoading.set(false);
    }
  }

  private userIdFromToken(token: string | null): string | null {
    const payload = token?.split('.')[1];
    if (!payload) {
      return null;
    }
    try {
      const claims = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as { sub?: unknown };
      return typeof claims.sub === 'string' ? claims.sub : null;
    } catch {
      return null;
    }
  }
}
