export interface AssistivePreferences {
  enabled: boolean;
  focus: boolean;
  hover: boolean;
  hoverDelay: number;
  rate: number;
  volume: number;
  voiceURI: string;
  enhancedFocus: boolean;
  textSize: 'standard' | 'large' | 'extra-large';
  textSpacing: boolean;
  contrast: boolean;
  highlightSpeech: boolean;
}
const record = (value: unknown): Partial<Record<keyof AssistivePreferences, unknown>> => value && typeof value === 'object' ? value as Partial<Record<keyof AssistivePreferences, unknown>> : {};
const numberIn = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
export function parseAssistivePreferences(voice: unknown, visual: unknown = {}): AssistivePreferences {
  const v = record(voice), l = record(visual);
  return {
    enabled: v.enabled === true, focus: v.focus === true, hover: v.hover === true,
    hoverDelay: numberIn(v.hoverDelay, 400, 700, 550), rate: numberIn(v.rate, .5, 2, 1),
    volume: numberIn(v.volume, 0, 1, 1), voiceURI: typeof v.voiceURI === 'string' ? v.voiceURI.slice(0, 300) : '',
    enhancedFocus: l.enhancedFocus === true,
    textSize: l.textSize === 'large' || l.textSize === 'extra-large' ? l.textSize : 'standard',
    textSpacing: l.textSpacing === true, contrast: l.contrast === true, highlightSpeech: l.highlightSpeech === true,
  };
}
export function mergeAssistivePreferences(voice: unknown, visual: unknown, patch: Partial<AssistivePreferences>) {
  const { enabled, focus, hover, hoverDelay, rate, volume, voiceURI, ...looks } = { ...parseAssistivePreferences(voice, visual), ...patch };
  const next = parseAssistivePreferences({ enabled, focus, hover, hoverDelay, rate, volume, voiceURI }, looks);
  return {
    voice: { ...record(voice), enabled: next.enabled, focus: next.focus, hover: next.hover, hoverDelay: next.hoverDelay, rate: next.rate, volume: next.volume, voiceURI: next.voiceURI },
    visual: { ...record(visual), enhancedFocus: next.enhancedFocus, textSize: next.textSize, textSpacing: next.textSpacing, contrast: next.contrast, highlightSpeech: next.highlightSpeech },
  };
}
/** Apply before first paint as well as when settings change; standard preferences add no overrides. */
export function applyAssistiveVisuals(root: HTMLElement, settings: AssistivePreferences): void {
  for (const [key, value] of Object.entries({
    'focus': settings.enhancedFocus, 'spacing': settings.textSpacing, 'contrast': settings.contrast,
  })) root.toggleAttribute(`data-a11y-${key}`, value);
  if (settings.textSize === 'standard') root.removeAttribute('data-a11y-text');
  else root.setAttribute('data-a11y-text', settings.textSize);
}
