import { ApiHttpClient, SESSION_AUTH } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { inject, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LIVE_REPORTS, type LiveReports, type ReportSummary } from './live-reports';
import { TRADE_TRAIL, type TradeTrail, type TradeTrailResponse } from './trade-trail';
import { routes } from './app.routes';
import { AppSessionService } from './app-session.service';
import { authInterceptor } from './auth-routing';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LIVE_REPORTS, useFactory: (): LiveReports => {
      const http = inject(ApiHttpClient);
      return { load: () => firstValueFrom(http.get<ReportSummary>('/api/v1/reports/summary')) };
    } },
    { provide: TRADE_TRAIL, useFactory: (): TradeTrail => {
      const http = inject(ApiHttpClient);
      return {
        load: (orderId) => firstValueFrom(
          http.get<TradeTrailResponse>(`/api/v1/trades/${encodeURIComponent(orderId)}/events`)),
      };
    } },
    { provide: SESSION_AUTH, useExisting: AuthService },
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AppSessionService).initialize()),
    provideBrowserGlobalErrorListeners(),
  ],
};
