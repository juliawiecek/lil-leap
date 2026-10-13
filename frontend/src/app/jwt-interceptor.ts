import { inject } from '@angular/core';
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { isProtectedRequest, shouldEndSession } from '../../../frontend-shared/http-policy.ts';

export const jwtInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isProtectedRequest(request.url, window.location.origin)) return next(request);
  const auth = inject(AuthService);
  const token = auth.accessToken;
  const authorized = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  return next(authorized).pipe(catchError(error => {
    if (error instanceof HttpErrorResponse && shouldEndSession(error.status, token, auth.accessToken)) auth.endSession();
    return throwError(() => error);
  }));
};
