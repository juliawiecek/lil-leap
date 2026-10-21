/** Canvas needs resolved colours; SVG and CSS can reference tokens directly. */
export function readThemeColour(token: string, root = globalThis.document?.documentElement): string {
  if (!root) {
    return '';
  }
  return root.ownerDocument.defaultView?.getComputedStyle(root).getPropertyValue(token).trim() ?? '';
}

export function readThemeRgb(token: string, root = globalThis.document?.documentElement): number[] {
  let colour = readThemeColour(token, root);
  if (colour.startsWith('#')) {
    const raw = colour.slice(1);
    const hex = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw;
    return [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
  }
  if (colour && !colour.startsWith('rgb') && root) {
    // System colours in forced-colours mode must resolve before numeric Canvas interpolation.
    // Probing through the root's own document keeps this usable from a test document too.
    const owner = root.ownerDocument;
    const probe = owner.createElement('span');
    probe.style.color = colour;
    root.appendChild(probe);
    colour = owner.defaultView?.getComputedStyle(probe).color || colour;
    probe.remove();
  }
  return colour.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
}

/** Attribute changes repaint Canvas in place without reseeding its data or animation. */
export function observeColourMode(redraw: () => void): () => void {
  const document = globalThis.document;
  const Observer = document?.defaultView?.MutationObserver;
  if (!Observer) {
    return () => {};
  }
  const observer = new Observer(redraw);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-colour-mode'] });
  const preferences = ['(forced-colors: active)', '(prefers-contrast: more)'].map(query => document.defaultView?.matchMedia(query));
  preferences.forEach(preference => preference?.addEventListener('change', redraw));
  return () => {
    observer.disconnect();
    preferences.forEach(preference => preference?.removeEventListener('change', redraw));
  };
}
