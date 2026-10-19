import { ApiHttpClient, SESSION_AUTH } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { inject, provideAppInitializer } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  LIVE_REPORTS, REPORT_FILES, attachmentFilename,
  type LiveReports, type ReportFiles, type ReportSummary,
} from './live-reports';
import { routes } from './app.routes';
import { AppSessionService } from './app-session.service';
import { authInterceptor } from './auth-routing';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LIVE_REPORTS, useFactory: (): LiveReports => {
      const http = inject(ApiHttpClient);
      const session = inject(AppSessionService);
      const router = inject(Router);
      return {
        load: () => firstValueFrom(http.get<ReportSummary>('/api/v1/reports/summary')),
        logout: async () => {
          await session.logout();
          await router.navigate(['/login'], { replaceUrl: true });
        },
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
