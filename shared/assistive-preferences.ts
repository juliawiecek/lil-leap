/** How much voice assistance says about each item (PS-22): Brief is name and value; Detailed adds role and state. */
export type SpeechLevel = 'brief' | 'detailed';
export interface AssistivePreferences {
  enabled: boolean;
  focus: boolean;
  hover: boolean;
  hoverDelay: number;
  rate: number;
  volume: number;
  voiceURI: string;
  level: SpeechLevel;
  /** Short sounds for switch-control moves, keypads, fills, rejections and the inactivity warning; independent of speech. */
  soundCues: boolean;
  enhancedFocus: boolean;
  textSize: 'standard' | 'large' | 'extra-large';
  textSpacing: boolean;
  contrast: boolean;
  highlightSpeech: boolean;
}
/** Voice speeds offered everywhere a voice speaks (voice assistance and the audio briefing share one speed). */
export const SPEECH_RATES: readonly number[] = [0.8, 1, 1.25, 1.5, 2];
const record = (value: unknown): Partial<Record<keyof AssistivePreferences, unknown>> => value && typeof value === 'object' ? value as Partial<Record<keyof AssistivePreferences, unknown>> : {};
const numberIn = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
/** The offered speed nearest a saved one, so an older 0.75 ("Slow") still shows as Slow. */
const nearestRate = (rate: number): number => SPEECH_RATES.reduce((best, r) => Math.abs(r - rate) < Math.abs(best - rate) ? r : best, 1);
export function parseAssistivePreferences(voice: unknown, visual: unknown = {}): AssistivePreferences {
  const v = record(voice), l = record(visual);
  return {
    enabled: v.enabled === true, focus: v.focus === true, hover: v.hover === true,
    hoverDelay: numberIn(v.hoverDelay, 400, 700, 550), rate: nearestRate(numberIn(v.rate, .5, 2, 1)),
    volume: numberIn(v.volume, 0, 1, 1), voiceURI: typeof v.voiceURI === 'string' ? v.voiceURI.slice(0, 300) : '',
    level: v.level === 'detailed' ? 'detailed' : 'brief', soundCues: v.soundCues === true,
    enhancedFocus: l.enhancedFocus === true,
    textSize: l.textSize === 'large' || l.textSize === 'extra-large' ? l.textSize : 'standard',
    textSpacing: l.textSpacing === true, contrast: l.contrast === true, highlightSpeech: l.highlightSpeech === true,
  };
}
export function mergeAssistivePreferences(voice: unknown, visual: unknown, patch: Partial<AssistivePreferences>) {
  const { enabled, focus, hover, hoverDelay, rate, volume, voiceURI, level, soundCues, ...looks } = { ...parseAssistivePreferences(voice, visual), ...patch };
  const next = parseAssistivePreferences({ enabled, focus, hover, hoverDelay, rate, volume, voiceURI, level, soundCues }, looks);
  return {
    voice: { ...record(voice), enabled: next.enabled, focus: next.focus, hover: next.hover, hoverDelay: next.hoverDelay, rate: next.rate, volume: next.volume, voiceURI: next.voiceURI, level: next.level, soundCues: next.soundCues },
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
