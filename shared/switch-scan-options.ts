import { InjectionToken, inject, signal } from '@angular/core';

export interface ScanStore {
  read<T>(section: string, parse: (value: unknown) => T): T;
  write(section: string, value: unknown): void;
}
/** Safe browser defaults also support standalone engine tests outside an injector. */
export class BrowserScanStore implements ScanStore {
  private readonly values;
  constructor(private readonly key = 'nexttrade.accessibility') {
    let saved = {};
    try { const parsed = JSON.parse(globalThis.localStorage?.getItem(key) || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed; } catch {}
    this.values = signal<Record<string, unknown>>(saved);
  }
  read<T>(section: string, parse: (value: unknown) => T): T { return parse(this.values()[section]); }
  write(section: string, value: unknown): void {
    this.values.update(saved => ({ ...saved, [section]: value }));
    try { globalThis.localStorage?.setItem(this.key, JSON.stringify(this.values())); } catch {}
  }
}
export const SWITCH_SCAN_STORE = new InjectionToken<ScanStore>('SWITCH_SCAN_STORE', { providedIn: 'root', factory: () => new BrowserScanStore() });
export const SWITCH_SCAN_FORMAT = new InjectionToken<(text: string) => string>('SWITCH_SCAN_FORMAT', { providedIn: 'root', factory: () => text => text });
export function scanStore(): ScanStore { try { return inject(SWITCH_SCAN_STORE); } catch { return new BrowserScanStore(); } }
export function scanFormat(): (text: string) => string { try { return inject(SWITCH_SCAN_FORMAT); } catch { return text => text; } }
