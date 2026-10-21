/** Solid-background text audit. Gradients, opacity and real assistive technology still need review. */
export async function auditTextContrast(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const colours = new Map();
    const rgba = value => {
      if (!colours.has(value)) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        colours.set(value, [...context.getImageData(0, 0, 1, 1).data].map(c => c / 255));
      }
      return colours.get(value);
    };
    const over = (front, back) => front.slice(0, 3).map((c, i) => c * front[3] + back[i] * (1 - front[3])).concat(1);
    const luminance = colour => colour.slice(0, 3).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const failures = [], skipped = [];
    let checked = 0;
    for (const element of document.querySelectorAll('body *')) {
      const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
      if (!text || element.closest('[aria-hidden=true], .sr-only, [disabled]')) continue;
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      if (!bounds.width || !bounds.height || style.visibility === 'hidden' || style.display === 'none') continue;
      if (element.closest('svg') && element.tagName !== 'text') continue;
      const chain = [];
      let ancestor = element, translucent = false, gradient = false;
      while (ancestor) {
        const current = getComputedStyle(ancestor);
        if (Number(current.opacity) < .99) translucent = true;
        if (current.backgroundImage !== 'none') gradient = true;
        chain.unshift(rgba(current.backgroundColor));
        ancestor = ancestor.parentElement;
      }
      if (translucent) { skipped.push({ text: text.slice(0, 60), reason: 'opacity' }); continue; }
      let background = rgba(getComputedStyle(document.documentElement).getPropertyValue('--background'));
      for (const colour of chain) background = over(colour, background);
      const backgrounds = style.backgroundImage.startsWith('linear-gradient')
        ? [...style.backgroundImage.matchAll(/(?:rgba?|oklch|color)\([^)]+\)/g)].map(match => over(rgba(match[0]), background))
        : [background];
      const foreground = rgba(element.tagName === 'text' ? style.fill : style.color);
      const ratios = backgrounds.map(background => {
        const painted = over(foreground, background);
        const [low, high] = [luminance(painted), luminance(background)].sort((a, b) => a - b);
        return (high + .05) / (low + .05);
      });
      const ratio = Math.min(...ratios);
      const large = parseFloat(style.fontSize) >= 24 || (Number(style.fontWeight) >= 700 && parseFloat(style.fontSize) >= 18.66);
      checked++;
      if (ratio < (large ? 3 : 4.5)) failures.push({ text: text.slice(0, 70), selector: element.tagName.toLowerCase() + '.' + element.className,
        foreground: style.color, background: background.slice(0, 3).map(c => Math.round(c * 255)), ratio: Number(ratio.toFixed(2)), gradient });
    }
    return { checked, failures, skipped };
  });
}
