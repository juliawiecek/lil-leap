import { Injectable, signal } from '@angular/core';

/**
 * Color-blind friendly colors: gains and losses switch from green and red, which about 1 in 12 men
 * cannot tell apart, to blue and orange, and every rise and fall gets an arrow so color is never the
 * only clue. The mode is a data attribute on <html>; styles.scss redefines --gain and --loss under it.
 */
export type ColorMode = 'standard' | 'colorblind';

export const COLOR_MODE_STORAGE_KEY = 'nexttrade-color-mode';

/** The saved mode, or standard when nothing valid is stored. */
export function parseColorMode(raw: string | null): ColorMode {
  return raw === 'colorblind' ? 'colorblind' : 'standard';
}

/** Puts the mode on the page so every view, including sign-in, picks it up. */
export function applyColorMode(mode: ColorMode, doc: Document | undefined = globalThis.document): void {
  const root = doc?.documentElement;
  if (!root) {
    return;
  }
  if (mode === 'colorblind') {
    root.dataset['colorMode'] = 'colorblind';
  } else {
    delete root.dataset['colorMode'];
  }
}

@Injectable({ providedIn: 'root' })
export class ColorModeService {
  readonly mode = signal<ColorMode>(parseColorMode(readStorage()));

  constructor() {
    applyColorMode(this.mode());
  }

  set(mode: ColorMode): void {
    this.mode.set(mode);
    applyColorMode(mode);
    try {
      globalThis.localStorage?.setItem(COLOR_MODE_STORAGE_KEY, mode);
    } catch {
      // Storage can be blocked; the colors still apply until the page reloads.
    }
  }
}

function readStorage(): string | null {
  try {
    return globalThis.localStorage?.getItem(COLOR_MODE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
