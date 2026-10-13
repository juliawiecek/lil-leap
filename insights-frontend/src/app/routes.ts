import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes } from '@angular/router';
import { AuthService } from './auth.service';
import { App } from './app';
import { Login } from './login';

export const sessionGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.sessionValid && auth.userRole === 'ANALYST') return true;
  if (auth.accessToken) auth.clearSession();
  auth.session.stop();
  return inject(Router).createUrlTree(['/login']);
};
export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'dashboard', component: App, canActivate: [sessionGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
