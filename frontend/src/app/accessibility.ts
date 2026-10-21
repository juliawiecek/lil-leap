import { EnvironmentProviders, InjectionToken, Injectable, inject, makeEnvironmentProviders, provideAppInitializer, signal } from '@angular/core';

/**
 * One place for every accessibility setting (PS-17): briefing, switch control, voice mode,
 * colour-blind mode and live price updates each keep their choices under their own section of a
 * single entry in this browser. Nothing is stored until a feature is turned on, so every feature
 * starts off; blocked storage means defaults for this visit, never an error.
 */
export const ACCESSIBILITY_STORAGE_KEY = 'nexttrade.accessibility';

/** The sections the accessibility tickets own (PS-18, PS-19, PS-21, PS-22, PS-27). */
export type AccessibilitySection = 'briefing' | 'switchControl' | 'voice' | 'colourMode' | 'livePrices';

/** Saved settings, or an empty set when nothing valid is stored. */
export function parseAccessibility(stored: string | null): Partial<Record<AccessibilitySection, unknown>> {
  if (!stored) {
    return {};
  }
  try {
    const raw: unknown = JSON.parse(stored);
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<Record<AccessibilitySection, unknown>>) : {};
  } catch {
    // A corrupt entry is replaced on the next save.
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class AccessibilityStore {
  readonly #values = signal(parseAccessibility(readStored()));

  /**
   * A feature's settings. `parse` turns what was saved (undefined when nothing was) into valid
   * settings, so a missing or tampered section always falls back to the feature's defaults.
   */
  read<T>(section: AccessibilitySection, parse: (saved: unknown) => T): T {
    return parse(this.#values()[section]);
  }

  /** Saves a feature's settings; they still apply for this visit when storage is blocked. */
  write(section: AccessibilitySection, value: unknown): void {
    this.#values.update((values) => ({ ...values, [section]: value }));
    try {
      globalThis.localStorage?.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(this.#values()));
    } catch {
      // Storage can be blocked; the setting still applies until the page reloads.
    }
  }
}

/**
 * The app's shared store. Feature services also run outside Angular in plain unit tests, where
 * there is no injector; they get a store of their own that reads the same browser entry.
 */
export function accessibilityStore(): AccessibilityStore {
  try {
    return inject(AccessibilityStore);
  } catch {
    return new AccessibilityStore();
  }
}

function readStored(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACCESSIBILITY_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Work a feature needs done before the first page draws, such as colour-blind mode setting its
 * colours so the page never flashes the old ones. Register with provideAccessibilityStartup().
 */
export const ACCESSIBILITY_STARTUP = new InjectionToken<ReadonlyArray<(store: AccessibilityStore) => void>>('ACCESSIBILITY_STARTUP');

/** Registers one feature's startup work; add it to the app's providers. */
export function provideAccessibilityStartup(apply: (store: AccessibilityStore) => void) {
  return { provide: ACCESSIBILITY_STARTUP, multi: true, useValue: apply };
}

/** Loads the saved settings and runs every feature's startup work. Call in an injection context. */
export function runAccessibilityStartup(): void {
  const store = inject(AccessibilityStore);
  for (const apply of inject(ACCESSIBILITY_STARTUP, { optional: true }) ?? []) {
    apply(store);
  }
}

/** Runs the accessibility startup work before the app starts. */
export function provideAccessibility(): EnvironmentProviders {
  return makeEnvironmentProviders([provideAppInitializer(runAccessibilityStartup)]);
}
