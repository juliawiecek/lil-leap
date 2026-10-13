import { ApplicationConfig, provideBrowserGlobalErrorListeners, inject } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { routes } from './routes';
import { jwtInterceptor } from './jwt-interceptor';
import { AuthService } from './auth.service';
import { LIVE_REPORTS, type LiveReports } from './live-reports';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideRouter(routes),
    { provide: LIVE_REPORTS, useFactory: (): LiveReports => {
      const auth = inject(AuthService);
      const router = inject(Router);
      return {
        async load() {
          const response = await auth.transport('/api/v1/reports/summary');
          if (!response.ok) throw new Error('Could not load reporting summary.');
          return response.json();
        },
        async logout() {
          await auth.logout();
          await router.navigate(['/login'], { replaceUrl: true });
        },
      };
    } },
  ],
};
