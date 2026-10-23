/** Concise descriptions for optional speech; native HTML/ARIA remains the accessibility API. */
const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();
export function readableText(element: Element, limit = 600): string {
  if (element.matches('[aria-hidden="true"], [hidden], script, style, svg, input, textarea, select')) return '';
  let result = '';
  for (const node of element.childNodes) {
    result += node.nodeType === 3 ? ` ${node.textContent ?? ''}` : node.nodeType === 1 ? ` ${readableText(node as Element, limit)}` : '';
    if (result.length > limit * 2) break;
  }
  return tidy(result).slice(0, limit);
}
export function namedBy(element: Element, attribute: string): string {
  return (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)
    .map(id => element.ownerDocument.getElementById(id)).filter((node): node is HTMLElement => !!node)
    .map(node => readableText(node, 500)).join(' ');
}
export function accessibleName(element: Element): string {
  const field = element as HTMLInputElement;
  return tidy(namedBy(element, 'aria-labelledby') || element.getAttribute('aria-label') ||
    element.getAttribute('data-a11y-label') || [...(field.labels ?? [])].map(label => readableText(label, 160)).join(' ') ||
    readableText(element, 220) || element.getAttribute('title') || field.placeholder || '');
}
/** Brief (the default) says an item's name and value; Detailed adds its role and state (PS-22). */
export type DescriptionLevel = 'brief' | 'detailed';
/**
 * What voice assistance says for an element. `requested` is an explicit read (Alt+Shift+R), which
 * allows longer content. Fields are said as label and value ("Number of shares, 2", or "empty").
 * Being unavailable or invalid is always said, since it stops the person acting.
 */
export function describeElement(element: Element, requested = false, level: DescriptionLevel = 'detailed'): string {
  if (element.closest('[inert], [aria-hidden="true"], [hidden]')) return '';
  const detailed = level === 'detailed';
  const field = element as HTMLInputElement;
  // `data-speak` holds the wording meant for the ear ("1 week", "Apple, up 1 percent") while the
  // accessible name keeps the visible text (WCAG 2.5.3, PS-20); speech prefers the spoken form.
  const name = tidy(element.getAttribute('data-speak') ?? '') || accessibleName(element);
  if (!name) return '';
  const role = element.getAttribute('role') || ({ BUTTON: 'button', A: 'link', SELECT: 'listbox', TEXTAREA: 'text field', SUMMARY: 'disclosure', H1: 'heading', H2: 'heading', H3: 'heading', TH: 'table heading', TD: 'table cell' } as Record<string, string>)[element.tagName];
  const secret = element.matches('input[type="password"], [autocomplete="current-password"], [autocomplete="new-password"]');
  const hiddenValue = secret || !!element.closest('[data-a11y-sensitive]');
  const type = element.tagName === 'INPUT' ? (secret ? 'password' : field.type) : '';
  const toggle = type === 'checkbox' || type === 'radio';
  let first = name;
  if (element.tagName === 'SELECT') first = `${name}, ${(element as HTMLSelectElement).selectedOptions?.[0]?.textContent ?? field.value}`;
  else if ((type && !toggle) || element.tagName === 'TEXTAREA') {
    // A password or private detail is never read out, only whether anything is typed.
    if (!field.value) first = `${name}, empty`;
    else if (!hiddenValue) first = `${name}, ${field.value.slice(0, 100)}`;
  }
  const parts = [first];
  if (detailed) {
    if (type) parts.push(toggle ? type : `${type} field`);
    else if (role) parts.push(role === 'img' ? 'chart' : role);
    if (field.required) parts.push('Required');
    if (toggle) parts.push(field.checked ? 'checked' : 'not checked');
  }
  if (field.disabled || element.getAttribute('aria-disabled') === 'true') parts.push('Unavailable');
  if (detailed) {
    if (field.readOnly) parts.push('Read only');
    if (element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true') parts.push('Selected');
    if (element.hasAttribute('aria-checked')) parts.push(element.getAttribute('aria-checked') === 'true' ? 'On' : 'Off');
    if (element.hasAttribute('aria-expanded')) parts.push(element.getAttribute('aria-expanded') === 'true' ? 'Expanded' : 'Collapsed');
    if (element.getAttribute('aria-current')) parts.push('Current page');
  }
  const invalid = element.getAttribute('aria-invalid') === 'true';
  if (invalid) parts.push('Invalid entry');
  const description = element.getAttribute('data-a11y-description') || namedBy(element, 'aria-describedby');
  if (element.hasAttribute('data-a11y-read') && element.hasAttribute('data-a11y-label') && !description) {
    const content = readableText(element, requested ? 1200 : 400);
    if (content && content !== name) parts.push(content);
  }
  // Brief keeps a chart's summary (its value) and an error message; other help text is Detailed.
  if (description && (detailed || invalid || role === 'img')) parts.push(description.slice(0, requested ? 1000 : 260));
  if (detailed && role === 'img' && description && !requested) parts.push('Use Explain this chart for details');
  if (detailed && element.closest('nav') && role !== 'heading') parts.push('Navigation');
  // Spoken wording can end in its own full stop ("… Select to trade."); never say two.
  return parts.map(part => tidy(part).replace(/[.\s]+$/, '')).filter(Boolean).join('. ') + '.';
}
