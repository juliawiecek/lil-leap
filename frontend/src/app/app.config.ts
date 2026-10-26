import { SESSION_AUTH, SESSION_WARNING_ANNOUNCE } from '@lilleap/session-core/angular';
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
import { PageTitleStrategy } from './page-title';
import { SiteAccessibility } from './site-accessibility';

import { speechCoordinator } from '../../../shared/speech-coordinator';
import { BriefingService } from './briefing-button';
import { SwitchScanService as WarningScanner } from './switch-scan';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: SESSION_WARNING_ANNOUNCE, useFactory: () => { const voice = inject(SiteAccessibility); const briefing = inject(BriefingService); const scan = inject(WarningScanner); return (text: string) => { briefing.stop(); speechCoordinator.stop(); if (speechCoordinator.supported && (voice.settings().enabled || scan.settings().enabled)) { const utterance = new SpeechSynthesisUtterance(text); speechCoordinator.submit('session-warning', utterance, { interrupt: true, defaultVoice: true }); } }; } },
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
