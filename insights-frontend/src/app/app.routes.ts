import { Routes } from '@angular/router';
import { Login } from './login';
import { authGuard, guestGuard } from './auth-routing';
import { PAGE_PATHS } from './page-state';
export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'clients/:id', loadComponent: () => import('./app').then(module => module.App), canActivate: [authGuard] },
  { path: 'orders/:id', loadComponent: () => import('./app').then(module => module.App), canActivate: [authGuard] },
  ...Object.values(PAGE_PATHS).map(path => ({ path: path.slice(1), loadComponent: () => import('./app').then(module => module.App), canActivate: [authGuard] })),
  { path: 'trading-activity', redirectTo: 'history', pathMatch: 'full' },
  { path: 'trade-investigation', redirectTo: 'orders', pathMatch: 'full' },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
