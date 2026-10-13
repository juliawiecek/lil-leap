import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AppSessionService } from './app-session.service';
import { AuthService } from './auth.service';
import { safeReturnUrl } from './page-state';

export const authGuard: CanActivateFn = async (_, state) => {
  const session = inject(AppSessionService);
  const router = inject(Router);
  await session.initialize();
  if (session.authenticated) { await session.keeper.check(); }
  return session.authenticated || router.createUrlTree(['/login'], {
    queryParams: { returnUrl: safeReturnUrl(state.url) ?? '/dashboard' },
  });
};
export const guestGuard: CanActivateFn = async (_, state) => {
  const session = inject(AppSessionService);
  const router = inject(Router);
  await session.initialize();
  if (!session.authenticated) return true;
  const requested = new URL(state.url, 'http://local').searchParams.get('returnUrl');
  return router.parseUrl(safeReturnUrl(requested ?? '') ?? '/dashboard');
};
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;
  const url = new URL(request.url, window.location.origin);
  const owned = url.origin === window.location.origin && url.pathname.startsWith('/api/');
  const sent = owned && token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  return next(sent).pipe(catchError(error => {
    if (owned && error.status === 401) auth.unauthorized(token);
    return throwError(() => error);
  }));
};
