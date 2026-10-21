/** Canvas needs resolved colours; SVG and CSS can reference tokens directly. */
export function readThemeColour(token: string, root = globalThis.document?.documentElement): string {
  if (!root) {
    return '';
  }
  return root.ownerDocument.defaultView?.getComputedStyle(root).getPropertyValue(token).trim() ?? '';
}

export function readThemeRgb(token: string): number[] {
  const colour = readThemeColour(token);
  if (colour.startsWith('#')) {
    const raw = colour.slice(1);
    const hex = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw;
    return [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
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
  return () => observer.disconnect();
}
