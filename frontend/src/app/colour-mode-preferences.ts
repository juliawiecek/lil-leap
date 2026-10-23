/** Shared by Angular and the small, parser-blocking bootstrap generated for index.html. */
export const ACCESSIBILITY_STORAGE_KEY = 'nexttrade.accessibility';
export const COLOUR_MODES = ['off', 'red-green', 'blue-yellow'] as const;
export type ColourMode = (typeof COLOUR_MODES)[number];

export function parseColourMode(saved: unknown): ColourMode {
  const mode = saved && typeof saved === 'object' ? (saved as { mode?: unknown }).mode : undefined;
  return COLOUR_MODES.find(candidate => candidate === mode) ?? 'off';
}

export function applyColourMode(mode: ColourMode, root = globalThis.document?.documentElement): void {
  root?.setAttribute('data-colour-mode', mode);
}

/** No Angular dependency: this runs before styles and the app can draw. Storage may be blocked. */
export function restoreColourMode(): ColourMode {
  let mode: ColourMode = 'off';
  try {
    const saved: unknown = JSON.parse(globalThis.localStorage?.getItem(ACCESSIBILITY_STORAGE_KEY) ?? 'null');
    mode = parseColourMode(saved && typeof saved === 'object' ? (saved as { colourMode?: unknown }).colourMode : undefined);
  } catch {
    // Missing, blocked or corrupt storage means Off for this visit.
  }
  applyColourMode(mode);
  return mode;
}
