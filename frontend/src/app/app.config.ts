import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { SafeErrorHandler } from './safe-error-handler';
import { provideRouter } from '@angular/router';
import { routes } from './routes';
import { jwtInterceptor } from './jwt-interceptor';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideRouter(routes),
    { provide: ErrorHandler, useClass: SafeErrorHandler },
    
  ]
};
