import { inject } from '@angular/core';
import { Routes, Router, CanActivateFn } from '@angular/router';
import { authGuard, guestGuard } from './auth-routing';
import { AppSessionService } from './app-session.service';
import { AuthService } from './auth.service';
import { PAGE_PATHS } from './page-state';
const tierGuard: CanActivateFn = async (route) => {
  const session = inject(AppSessionService);
  const auth = inject(AuthService);
  const router = inject(Router);
  await session.initialize();
  const tier = auth.traderLevel;
  const path = route.routeConfig?.path;
  if (path === 'learn' && tier !== 'NOVICE') {
    return router.createUrlTree(['/dashboard']);
  }
  if (['markets', 'screeners'].includes(path ?? '') && tier !== 'ADVANCED') {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./app').then((module) => module.App),
    canActivate: [guestGuard],
  },
  ...Object.values(PAGE_PATHS).map((path) => ({
    path: path.slice(1),
    loadComponent: () => import('./trading-workspace').then((module) => module.TradingWorkspace),
    canActivate: [authGuard, tierGuard],
  })),
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
