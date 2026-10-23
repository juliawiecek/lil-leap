import { Component, inject, OnInit } from '@angular/core';
import { StockDashboard } from './stock-dashboard';
import { AuthService } from './auth.service';
import { AppSessionService } from './app-session.service';
import { ProfileStore } from './profile-store';
@Component({ selector: 'app-trading-workspace', imports: [StockDashboard], styles: [':host { display:block; min-height:100vh; }'],
  template: `<app-stock-dashboard [name]="auth.email ?? ''" [level]="auth.traderLevel ?? 'NOVICE'" [profile]="profiles.profile()" [profileLoading]="profiles.loading()" [profileError]="profiles.error()" (signOut)="session.logout()" />` })
export class TradingWorkspace implements OnInit {
  readonly auth = inject(AuthService);
  readonly session = inject(AppSessionService);
  /** Loaded once here; Settings writes saved changes back into it (PS-07). */
  readonly profiles = inject(ProfileStore);

  ngOnInit(): void {
    void this.profiles.load();
  }
}
