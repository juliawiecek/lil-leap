import { Routes } from '@angular/router';
import { Login } from './login';
import { authGuard, guestGuard } from './auth-routing';
import { requireRole } from './roles';
import { Shell } from './shell/shell';

/** Pages cut in TS-18.4; old links and bookmarks land on the role's home page instead of a 404. */
export const RETIRED_PATHS = [
  'dashboard', 'history', 'trading-activity', 'client-activity', 'orders', 'orders/:id',
  'trade-investigation', 'compliance', 'settings',
];

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: 'insights', canActivate: [requireRole('ANALYST', 'OPERATIONS')], loadComponent: () => import('./pages/insights/insights-page').then((m) => m.InsightsPage) },
      { path: 'clients', canActivate: [requireRole('ANALYST', 'OPERATIONS')], loadComponent: () => import('./pages/clients/clients-page').then((m) => m.ClientsPage) },
      { path: 'clients/:id', canActivate: [requireRole('ANALYST', 'OPERATIONS')], loadComponent: () => import('./pages/client-detail/client-detail-page').then((m) => m.ClientDetailPage) },
      { path: 'reports', canActivate: [requireRole('ANALYST', 'OPERATIONS')], loadComponent: () => import('./pages/reports/reports-page').then((m) => m.ReportsPage) },
      { path: 'trades', canActivate: [requireRole('OPERATIONS')], loadComponent: () => import('./pages/trade-lookup/trade-lookup-page').then((m) => m.TradeLookupPage) },
      { path: 'trades/:id', canActivate: [requireRole('OPERATIONS')], loadComponent: () => import('./pages/trade-lookup/trade-lookup-page').then((m) => m.TradeLookupPage) },
      ...RETIRED_PATHS.map((path) => ({ path, redirectTo: 'insights' })),
      { path: '', redirectTo: 'insights', pathMatch: 'full' as const },
    ],
  },
  { path: '**', redirectTo: 'insights' },
];
