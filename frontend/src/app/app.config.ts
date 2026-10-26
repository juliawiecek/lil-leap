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
import { AccessibilityStore } from './accessibility';
import { speakable } from './speech-text';
import { SWITCH_SCAN_STORE, SWITCH_SCAN_FORMAT } from '../../../shared/switch-scan-options';
import { provideColourMode } from './colour-mode';
import { SwitchScanService } from '../../../shared/switch-scan';
import { PageTitleStrategy } from './page-title';
import { SiteAccessibility } from './site-accessibility';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: SWITCH_SCAN_STORE, useExisting: AccessibilityStore },
    { provide: SWITCH_SCAN_FORMAT, useValue: speakable },
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
    provideAccessibilityStartup(() => inject(SiteAccessibility).start()),
    provideBrowserGlobalErrorListeners(),

    { provide: ErrorHandler, useClass: SafeErrorHandler },
  ],
};
