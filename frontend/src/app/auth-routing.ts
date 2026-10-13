import { createAuthGuard, createGuestGuard } from '@lilleap/session-core/angular';
import { AppSessionService } from './app-session.service';
import { safeReturnUrl } from './page-state';
export { authInterceptor } from '@lilleap/session-core/angular';
export const authGuard = createAuthGuard(AppSessionService, safeReturnUrl);
export const guestGuard = createGuestGuard(AppSessionService, safeReturnUrl);
