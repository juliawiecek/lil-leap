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
export function describeElement(element: Element, detailed = false): string {
  if (element.closest('[inert], [aria-hidden="true"], [hidden]')) return '';
  const field = element as HTMLInputElement;
  const name = accessibleName(element);
  if (!name) return '';
  const role = element.getAttribute('role') || ({ BUTTON: 'button', A: 'link', SELECT: 'listbox', TEXTAREA: 'text field', SUMMARY: 'disclosure', H1: 'heading', H2: 'heading', H3: 'heading', TH: 'table heading', TD: 'table cell' } as Record<string, string>)[element.tagName];
  const parts = [name];
  const secret = element.matches('input[type="password"], [autocomplete="current-password"], [autocomplete="new-password"]');
  if (element.tagName === 'INPUT') {
    const type = secret ? 'password' : field.type;
    parts.push(`${field.required ? 'Required ' : ''}${type === 'checkbox' || type === 'radio' ? type : type + ' field'}`);
    if (type === 'checkbox' || type === 'radio') parts.push(field.checked ? 'checked' : 'not checked');
    else if (!secret && field.value && !element.closest('[data-a11y-sensitive]')) parts.push(`Value ${field.value.slice(0, 100)}`);
  } else if (role) parts.push(role === 'img' ? 'chart' : role);
  if (element.tagName === 'SELECT') parts.push(`Selected ${(element as HTMLSelectElement).selectedOptions?.[0]?.textContent ?? field.value}`);
  if (field.disabled || element.getAttribute('aria-disabled') === 'true') parts.push('Unavailable');
  if (field.readOnly) parts.push('Read only');
  if (element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true') parts.push('Selected');
  if (element.hasAttribute('aria-checked')) parts.push(element.getAttribute('aria-checked') === 'true' ? 'On' : 'Off');
  if (element.hasAttribute('aria-expanded')) parts.push(element.getAttribute('aria-expanded') === 'true' ? 'Expanded' : 'Collapsed');
  if (element.getAttribute('aria-current')) parts.push('Current page');
  if (element.getAttribute('aria-invalid') === 'true') parts.push('Invalid entry');
  const description = element.getAttribute('data-a11y-description') || namedBy(element, 'aria-describedby');
  if (element.hasAttribute('data-a11y-read') && element.hasAttribute('data-a11y-label') && !description) {
    const content = readableText(element, detailed ? 1200 : 400);
    if (content && content !== name) parts.push(content);
  }
  if (description) parts.push(description.slice(0, detailed ? 1000 : 260));
  if (role === 'img' && description && !detailed) parts.push('Use Explain this chart for details');
  if (element.closest('nav') && role !== 'heading') parts.push('Navigation');
  return parts.filter(Boolean).map(tidy).join('. ') + '.';
}
