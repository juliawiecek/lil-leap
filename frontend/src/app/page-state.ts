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
/**
 * The workspace's pages (PS-11: fewer pages). Orders and history are one Activity page; the
 * watchlist and screener live on Markets and the overview. Old paths redirect in app.routes.
 */
export const PAGE_PATHS: Record<string, string> = {
  Overview: '/dashboard',
  Portfolio: '/portfolio',
  Activity: '/activity',
  Markets: '/markets',
  Settings: '/settings',
  Learn: '/learn',
};
export function safeReturnUrl(value: string): string | null {
  return sharedReturnUrl(value, PAGE_PATHS, []);
}
