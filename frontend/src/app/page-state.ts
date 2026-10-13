import { Injectable, Injector, WritableSignal, effect, inject, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

export interface QueryField {
  key: string;
  value: WritableSignal<any>;
  allowed?: readonly string[];
  date?: boolean;
}
export interface PageBinding { go(page: string, id?: string): void; destroy(): void; }

/** Synchronizes existing workspace signals with URL state, including Back/Forward. */
@Injectable({ providedIn: 'root' })
export class PageState {
  private readonly router = inject(Router, { optional: true });
  private readonly injector = inject(Injector);
  connect(page: WritableSignal<string>, paths: Record<string, string>, fields: QueryField[],
          select?: (parts: string[]) => void): PageBinding {
    const router = this.router;
    if (!router?.config.length) return { go: name => page.set(name), destroy: () => {} };
    const defaults = fields.map(field => field.value());
    let applying = false;
    const currentUrl = () => router.getCurrentNavigation()?.finalUrl?.toString() ?? router.url;
    const apply = () => {
      applying = true;
      try {
        const url = new URL(currentUrl(), window.location.origin);
        const parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
        const name = Object.keys(paths).find(key => paths[key] === '/' + (parts[0] ?? 'dashboard'));
        if (name) page.set(name);
        fields.forEach((field, i) => {
          const raw = url.searchParams.get(field.key);
          let value: any = raw ?? defaults[i];
          if (typeof defaults[i] === 'boolean') value = raw === null ? defaults[i] : raw === '1';
          if (field.allowed && !field.allowed.includes(value)) value = defaults[i];
          if (field.date && raw !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw)) value = defaults[i];
          field.value.set(value);
        });
        select?.(parts);
      } finally { applying = false; }
    };
    apply();
    const query = () => Object.fromEntries(fields.map((field, i) => {
      const value = field.value();
      return [field.key, value === defaults[i] || value === '' ? null : typeof value === 'boolean' ? (value ? '1' : '0') : value];
    }));
    const subscription = router.events.subscribe(event => { if (event instanceof NavigationEnd) apply(); });
    const watcher = effect(() => {
      const values = query();
      untracked(() => {
        if (applying) return;
        const url = new URL(currentUrl(), window.location.origin);
        // Only this workspace owns its query state; never overwrite a login return URL.
        if (!Object.values(paths).some(path => url.pathname === path || url.pathname.startsWith(path + '/'))) return;
        const params = new URLSearchParams(url.searchParams);
        for (const [key, value] of Object.entries(values)) { if (value !== null) params.set(key, String(value)); else params.delete(key); }
        if (params.toString() !== url.searchParams.toString()) {
          void router.navigateByUrl(url.pathname + (params.size ? '?' + params.toString() : ''), { replaceUrl: true });
        }
      });
    }, { injector: this.injector, manualCleanup: true });
    return {
      go: (name, id) => {
        const path = paths[name];
        if (path) void router.navigate([path, ...(id ? [id] : [])], { queryParams: query() });
      },
      destroy: () => { subscription.unsubscribe(); watcher.destroy(); },
    };
  }
}

export const PAGE_PATHS: Record<string, string> = { Overview: '/dashboard', Orders: '/orders', History: '/history', Settings: '/settings', Watchlist: '/watchlist', Portfolio: '/portfolio', Learn: '/learn', Markets: '/markets', Screeners: '/screeners' };

/** Restrict post-login navigation to known local pages; reject external and malformed URLs. */
export function safeReturnUrl(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const url = new URL(value, 'http://local');
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.origin !== 'http://local' || !Object.values(PAGE_PATHS).includes('/' + parts[0])) return null;
    if (parts.length > 1) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
