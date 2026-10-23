import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** The staff roles Insights admits; any other token is turned away at sign-in. */
export type InsightsRole = 'ANALYST' | 'OPERATIONS';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  group: 'Analytics' | 'Operations';
}

const REPORTING: readonly NavItem[] = [
  { label: 'Insights', path: '/insights', icon: 'home', group: 'Analytics' },
  { label: 'Clients', path: '/clients', icon: 'user', group: 'Analytics' },
  { label: 'Reports', path: '/reports', icon: 'file', group: 'Analytics' },
];

/**
 * The pages each role sees, home page first (TS-18.4). Analysts get reporting; operations staff
 * get everything analysts see plus the trade lookup for audits and disputes (BR-15).
 */
export const NAV_BY_ROLE: Record<InsightsRole, readonly NavItem[]> = {
  ANALYST: REPORTING,
  OPERATIONS: [...REPORTING, { label: 'Trade lookup', path: '/trades', icon: 'search', group: 'Operations' }],
};

/** The role a signed-in token carries; the server decides it, the page never chooses it. */
export function roleOf(userRole: string | null | undefined): InsightsRole {
  return userRole === 'OPERATIONS' ? 'OPERATIONS' : 'ANALYST';
}

/** Where a role lands after sign-in or when it opens a page it may not see. */
export function homePath(userRole: string | null | undefined): string {
  return NAV_BY_ROLE[roleOf(userRole)][0].path;
}

/** Lets only the given roles open a page; anyone else is sent to their own home page instead. */
export function requireRole(...roles: InsightsRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    return roles.includes(auth.userRole as InsightsRole) || inject(Router).parseUrl(homePath(auth.userRole));
  };
}
