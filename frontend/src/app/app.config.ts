import { SESSION_AUTH } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { inject, provideAppInitializer } from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { AppSessionService } from './app-session.service';
import { authInterceptor } from './auth-routing';
import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { SafeErrorHandler } from './safe-error-handler';
import { provideAccessibility, provideAccessibilityStartup } from './accessibility';
import { provideColourMode } from './colour-mode';
import { SwitchScanService } from './switch-scan';
import { listenForGlossary } from './glossary';
import { PageTitleStrategy } from './page-title';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: SESSION_AUTH, useExisting: AuthService },
    provideRouter(routes),
    // Every page sets its own tab title, "Portfolio · NextTrade" (PS-20).
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AppSessionService).initialize()),
    provideAccessibility(),
    provideColourMode(),
    // Switch control resumes straight after a reload when it was left on, and Alt+S starts it
    // from any page, sign-in included (PS-19).
    provideAccessibilityStartup(() => inject(SwitchScanService).listenForShortcut()),
    // Alt+W explains the focused or ringed item aloud, with a caption, on every page (PS-23).
    provideAccessibilityStartup(() => {
      const scan = inject(SwitchScanService);
      listenForGlossary(document, scan.speech, () => scan.engine?.ringed() ?? null);
    }),
    provideBrowserGlobalErrorListeners(),

    { provide: ErrorHandler, useClass: SafeErrorHandler },
  ],
};
