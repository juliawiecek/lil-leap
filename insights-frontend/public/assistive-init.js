/* Generated from shared/assistive-preferences.ts. */
(function () { const exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPEECH_RATES = void 0;
exports.parseAssistivePreferences = parseAssistivePreferences;
exports.mergeAssistivePreferences = mergeAssistivePreferences;
exports.applyAssistiveVisuals = applyAssistiveVisuals;
exports.SPEECH_RATES = [0.8, 1, 1.25, 1.5, 2];
const record = (value) => value && typeof value === 'object' ? value : {};
const numberIn = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const nearestRate = (rate) => exports.SPEECH_RATES.reduce((best, r) => Math.abs(r - rate) < Math.abs(best - rate) ? r : best, 1);
function parseAssistivePreferences(voice, visual = {}) {
    const v = record(voice), l = record(visual);
    return {
        enabled: v.enabled === true, focus: v.focus === true, hover: v.hover === true,
        arrowNavigation: l.arrowNavigation === true || (l.arrowNavigation === undefined && v.enabled === true),
        hoverDelay: numberIn(v.hoverDelay, 400, 700, 550), rate: nearestRate(numberIn(v.rate, .5, 2, 1)),
        volume: numberIn(v.volume, 0, 1, 1), voiceURI: typeof v.voiceURI === 'string' ? v.voiceURI.slice(0, 300) : '',
        level: v.level === 'detailed' ? 'detailed' : 'brief', soundCues: v.soundCues === true,
        enhancedFocus: l.enhancedFocus === true,
        textSize: l.textSize === 'large' || l.textSize === 'extra-large' ? l.textSize : 'standard',
        textSpacing: l.textSpacing === true, contrast: l.contrast === true, highlightSpeech: l.highlightSpeech === true,
    };
}
function mergeAssistivePreferences(voice, visual, patch) {
    const { enabled, focus, hover, hoverDelay, rate, volume, voiceURI, level, soundCues, ...looks } = { ...parseAssistivePreferences(voice, visual), ...patch };
    const next = parseAssistivePreferences({ enabled, focus, hover, hoverDelay, rate, volume, voiceURI, level, soundCues }, looks);
    return {
        voice: { ...record(voice), enabled: next.enabled, focus: next.focus, hover: next.hover, hoverDelay: next.hoverDelay, rate: next.rate, volume: next.volume, voiceURI: next.voiceURI, level: next.level, soundCues: next.soundCues },
        visual: { ...record(visual), arrowNavigation: next.arrowNavigation, enhancedFocus: next.enhancedFocus, textSize: next.textSize, textSpacing: next.textSpacing, contrast: next.contrast, highlightSpeech: next.highlightSpeech },
    };
}
function applyAssistiveVisuals(root, settings) {
    for (const [key, value] of Object.entries({
        'focus': settings.enhancedFocus, 'spacing': settings.textSpacing, 'contrast': settings.contrast,
    }))
        root.toggleAttribute(`data-a11y-${key}`, value);
    if (settings.textSize === 'standard')
        root.removeAttribute('data-a11y-text');
    else
        root.setAttribute('data-a11y-text', settings.textSize);
}

try { const saved = JSON.parse(localStorage.getItem("nexttrade-insights.accessibility") || "{}") || {};
exports.applyAssistiveVisuals(document.documentElement, exports.parseAssistivePreferences(saved.voice, saved.visual)); } catch {}
})();
