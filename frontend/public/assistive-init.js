/* Generated from shared/assistive-preferences.ts. */
(function () { const exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAssistivePreferences = parseAssistivePreferences;
exports.mergeAssistivePreferences = mergeAssistivePreferences;
exports.applyAssistiveVisuals = applyAssistiveVisuals;
const record = (value) => value && typeof value === 'object' ? value : {};
const numberIn = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
function parseAssistivePreferences(voice, visual = {}) {
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
function mergeAssistivePreferences(voice, visual, patch) {
    const { enabled, focus, hover, hoverDelay, rate, volume, voiceURI, ...looks } = { ...parseAssistivePreferences(voice, visual), ...patch };
    const next = parseAssistivePreferences({ enabled, focus, hover, hoverDelay, rate, volume, voiceURI }, looks);
    return {
        voice: { ...record(voice), enabled: next.enabled, focus: next.focus, hover: next.hover, hoverDelay: next.hoverDelay, rate: next.rate, volume: next.volume, voiceURI: next.voiceURI },
        visual: { ...record(visual), enhancedFocus: next.enhancedFocus, textSize: next.textSize, textSpacing: next.textSpacing, contrast: next.contrast, highlightSpeech: next.highlightSpeech },
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

try { const saved = JSON.parse(localStorage.getItem("nexttrade.accessibility") || "{}") || {};
exports.applyAssistiveVisuals(document.documentElement, exports.parseAssistivePreferences(saved.voice, saved.visual)); } catch {}
})();
