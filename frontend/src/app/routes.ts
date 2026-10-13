import { Component, inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes } from '@angular/router';
import { AuthService } from './auth.service';

@Component({ selector: 'app-route-view', template: '' })
export class RouteView {}

export const sessionGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.sessionValid && auth.userRole === 'TRADER') return true;
  if (auth.accessToken) auth.clearSession();
  auth.session.stop();
  return inject(Router).createUrlTree(['/login']);
};

export const routes: Routes = [
  { path: 'login', component: RouteView },
  { path: 'register', component: RouteView },
  { path: 'dashboard', component: RouteView, canActivate: [sessionGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
