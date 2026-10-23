import { inject } from '@angular/core';
import { Routes, Router, CanActivateFn } from '@angular/router';
import { authGuard, guestGuard } from './auth-routing';
import { AppSessionService } from './app-session.service';
import { AuthService } from './auth.service';
import { PAGE_PATHS } from './page-state';
import { NotFound } from './not-found';
const tierGuard: CanActivateFn = async (route) => {
  const session = inject(AppSessionService);
  const auth = inject(AuthService);
  const router = inject(Router);
  await session.initialize();
  const tier = auth.traderLevel;
  const path = route.routeConfig?.path;
  if (path === 'markets' && tier !== 'ADVANCED') {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    loadComponent: () => import('./app').then((module) => module.App),
    canActivate: [guestGuard],
  },
  // The emailed reset link (PS-08); without its own route the wildcard would redirect it and drop the token.
  {
    path: 'reset-password',
    title: 'Reset password',
    loadComponent: () => import('./app').then((module) => module.App),
    canActivate: [guestGuard],
  },
  // Each page names itself in the browser tab: "Portfolio · NextTrade" (PS-20, page-title.ts).
  ...Object.entries(PAGE_PATHS).map(([title, path]) => ({
    title,
    path: path.slice(1),
    loadComponent: () => import('./trading-workspace').then((module) => module.TradingWorkspace),
    canActivate: [authGuard, tierGuard],
  })),
  // PS-11 merged these pages; old links and bookmarks still land somewhere sensible.
  { path: 'orders', redirectTo: 'activity' },
  { path: 'history', redirectTo: 'activity' },
  { path: 'watchlist', redirectTo: 'markets' },
  { path: 'screeners', redirectTo: 'markets' },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', component: NotFound, title: 'Page not found' },
];
