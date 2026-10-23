import { safeReturnUrl as sharedReturnUrl } from '@lilleap/session-core/angular';

/** Every page a signed-in user may be returned to after signing in. */
export const PAGE_PATHS: Record<string, string> = {
  Insights: '/insights',
  Clients: '/clients',
  Reports: '/reports',
  'Trade lookup': '/trades',
};
export function safeReturnUrl(value: string): string | null {
  return sharedReturnUrl(value, PAGE_PATHS, ['trades', 'clients']);
}
