import { Injectable } from '@angular/core';
import {
  PageState as SharedPageState,
  safeReturnUrl as sharedReturnUrl,
} from '@lilleap/session-core/angular';
export type { PageBinding, QueryField } from '@lilleap/session-core/angular';
@Injectable({ providedIn: 'root' })
export class PageState extends SharedPageState {
  constructor() {
    super();
  }
}
export const PAGE_PATHS: Record<string, string> = {
  Overview: '/dashboard',
  Orders: '/orders',
  History: '/history',
  Settings: '/settings',
  Watchlist: '/watchlist',
  Portfolio: '/portfolio',
  Learn: '/learn',
  Markets: '/markets',
  Screeners: '/screeners',
};
export function safeReturnUrl(value: string): string | null {
  return sharedReturnUrl(value, PAGE_PATHS, []);
}
