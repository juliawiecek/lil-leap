import { Injectable, computed, inject } from '@angular/core';
import { AccessibilityStore, provideAccessibilityStartup } from './accessibility';
import { applyColourMode, parseColourMode, type ColourMode } from './colour-mode-preferences';

@Injectable({ providedIn: 'root' })
export class ColourModeStore {
  readonly #preferences = inject(AccessibilityStore);
  readonly mode = computed(() => this.#preferences.read('colourMode', parseColourMode));

  set(mode: ColourMode): void {
    this.#preferences.write('colourMode', { mode });
    applyColourMode(this.mode());
  }
}

/** PS-17 owns startup; registering here keeps the palette available before any view renders. */
export function provideColourMode() {
  return provideAccessibilityStartup(store => applyColourMode(store.read('colourMode', parseColourMode)));
}
