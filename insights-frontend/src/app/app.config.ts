import { ApiHttpClient, SESSION_AUTH } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { inject, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  LIVE_REPORTS, REPORT_FILES, attachmentFilename,
  type ActivityPoint, type LiveReports, type ReportFiles, type ReportSummary, type TopInstrument,
} from './live-reports';
import { TRADE_TRAIL, type TradeTrail, type TradeTrailResponse } from './trade-trail';
import { routes } from './app.routes';
import { AppSessionService } from './app-session.service';
import { authInterceptor } from './auth-routing';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LIVE_REPORTS, useFactory: (): LiveReports => {
      const http = inject(ApiHttpClient);
      return {
        load: () => firstValueFrom(http.get<ReportSummary>('/api/v1/reports/summary')),
        topInstruments: () => firstValueFrom(http.get<TopInstrument[]>('/api/v1/reports/insights/top-instruments')),
        activityTrend: () => firstValueFrom(http.get<ActivityPoint[]>('/api/v1/reports/insights/client-activity-trend')),
      };
    } },
    { provide: TRADE_TRAIL, useFactory: (): TradeTrail => {
      const http = inject(ApiHttpClient);
      return {
        load: (orderId) => firstValueFrom(
          http.get<TradeTrailResponse>(`/api/v1/trades/${encodeURIComponent(orderId)}/events`)),
      };
    } },
    { provide: REPORT_FILES, useFactory: (): ReportFiles => {
      // Report CSVs are text, which ApiHttpClient's JSON-typed get cannot return; the auth
      // interceptor below still attaches the session token to this same-origin /api request.
      const http = inject(HttpClient);
      return {
        generate: async (kind, range) => {
          const response = await firstValueFrom(http.get(`/api/v1/reports/generate/${kind}`, {
            params: { startDate: range.startDate, endDate: range.endDate },
            responseType: 'text',
            observe: 'response',
          }));
          return {
            filename: attachmentFilename(response.headers.get('Content-Disposition'),
              `${kind}_${range.startDate}_${range.endDate}.csv`),
            csv: response.body ?? '',
          };
        },
      };
    } },
    { provide: SESSION_AUTH, useExisting: AuthService },
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AppSessionService).initialize()),
    provideBrowserGlobalErrorListeners(),
  ],
};
