import { ApiHttpClient, SESSION_AUTH } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { inject, provideAppInitializer } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LIVE_REPORTS, type LiveReports, type ReportSummary } from './live-reports';
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
    { provide: SESSION_AUTH, useExisting: AuthService },
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AppSessionService).initialize()),
    provideBrowserGlobalErrorListeners(),
  ],
};
