import { Component, inject } from '@angular/core';
import { StockDashboard } from './stock-dashboard';
import { AuthService } from './auth.service';
import { AppSessionService } from './app-session.service';
@Component({ selector: 'app-trading-workspace', imports: [StockDashboard], styles: [':host { display:block; min-height:100vh; }'],
  template: `<app-stock-dashboard [name]="auth.email ?? ''" [level]="auth.traderLevel ?? 'NOVICE'" (signOut)="session.logout()" />` })
export class TradingWorkspace {
  readonly auth = inject(AuthService);
  readonly session = inject(AppSessionService);
}
