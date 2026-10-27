import { accessibleName, describeElement, namedBy, readableText } from './accessible-description.ts';

export type ArrowDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="tab"], [role="img"], [data-a11y-read]';
const CONTENT = 'h1, h2, h3, h4, h5, h6, p, li, dt, dd, td, th, output';
const ITEMS = `${CONTROLS}, ${CONTENT}, [tabindex], [contenteditable]:not([contenteditable="false"])`;
const GROUPS = '[data-scan-group], [data-a11y-nav-group], nav, aside, section[aria-label], section[aria-labelledby], fieldset, [role="group"][aria-label], [role="group"][aria-labelledby], [role="region"][aria-label], [role="region"][aria-labelledby]';
const NATIVE = 'button, a[href], input, select, textarea, summary, [role="tab"], [role="img"], [role="combobox"], [contenteditable]:not([contenteditable="false"])';

export function navigationVisible(element: Element): boolean {
  if (element.closest('[hidden], [inert], [aria-hidden="true"], dialog:not([open]), [role="status"], .sr-only')) return false;
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(parent);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
    if (parent.matches('details:not([open])') && !parent.querySelector('summary')?.contains(element)) return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isNavigationGroup(element: Element): boolean {
  return element.matches(GROUPS) && !element.matches(NATIVE) && navigationVisible(element) && !!element.querySelector(ITEMS);
}

export function navigationGroupName(element: Element): string {
  return element.getAttribute('data-a11y-nav-group') || element.getAttribute('data-scan-group') ||
    namedBy(element, 'aria-labelledby') || element.getAttribute('aria-label') ||
    readableText(element.querySelector(':scope > legend, h1, h2, h3') ?? element, 100) ||
    (element.matches('nav, aside') ? 'Navigation' : 'Options');
}

export function navigationRoot(document: Document, current?: Element): HTMLElement {
  const modal = [...document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')].filter(navigationVisible).at(-1);
  return modal ?? current?.closest<HTMLElement>('[data-a11y-popover]') ?? document.body;
}

/** The focused group's siblings belong to its parent; a focused control belongs to its enclosing group. */
export function parentNavigationGroup(element: Element, root: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (!root.contains(parent)) return null;
    if (isNavigationGroup(parent)) return parent;
  }
  return null;
}

/** A group is one stop until Enter opens it. Nested contents never leak into its siblings. */
export function navigationItems(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(`${ITEMS}, ${GROUPS}`)].filter(item => {
    if (!navigationVisible(item) || item.matches(':disabled, [aria-disabled="true"]')) return false;
    if (parentNavigationGroup(item, scope)) return false;
    if (isNavigationGroup(item)) return true;
    const owner = item.parentElement?.closest(CONTROLS);
    if (owner && scope.contains(owner) && !item.matches(CONTROLS)) return false;
    if (!item.matches(CONTROLS) && item.querySelector(`${ITEMS}, ${GROUPS}`)) return false;
    return !!describeElement(item);
  });
}

export function firstNavigationItem(items: HTMLElement[], last = false): HTMLElement | undefined {
  const ordered = [...items].sort((a, b) => {
    const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
    return x.top - y.top || x.left - y.left;
  });
  return last ? ordered.at(-1) : ordered[0];
}

/** Enter a navigation landmark at its current page, rather than its logo or resize handle. */
export function navigationEntryItem(scope: HTMLElement): HTMLElement | undefined {
  const navigation = scope.matches('nav, [role="navigation"]') ? scope :
    scope.matches('aside, [role="complementary"]') ? scope.querySelector<HTMLElement>('nav, [role="navigation"]') : null;
  if (navigation) {
    const links = [...navigation.querySelectorAll<HTMLElement>('a[href], button')]
      .filter(item => navigationVisible(item) && !item.matches(':disabled, [aria-disabled="true"]'));
    const current = links.find(item => item.getAttribute('aria-current') === 'page');
    if (current || links.length) return current ?? firstNavigationItem(links);
  }
  return firstNavigationItem(navigationItems(scope));
}

/** Use the rendered layout, re-read on each key so scrolling and responsive reflow are reflected. */
export function spatialNeighbor(current: HTMLElement, items: HTMLElement[], direction: ArrowDirection): HTMLElement | undefined {
  if (!items.includes(current) && (current.matches('body, main, dialog, [role="dialog"], [role="alertdialog"]') || !navigationVisible(current))) {
    return firstNavigationItem(items, direction === 'ArrowUp' || direction === 'ArrowLeft');
  }
  const origin = current.getBoundingClientRect();
  const vertical = direction === 'ArrowUp' || direction === 'ArrowDown';
  const forward = direction === 'ArrowDown' || direction === 'ArrowRight';
  const start = vertical ? origin.top : origin.left, end = vertical ? origin.bottom : origin.right;
  const crossStart = vertical ? origin.left : origin.top, crossEnd = vertical ? origin.right : origin.bottom;
  const ranked = items.filter(item => item !== current).flatMap(item => {
    const rect = item.getBoundingClientRect();
    const near = vertical ? rect.top : rect.left, far = vertical ? rect.bottom : rect.right;
    // An item beside us is never a Down/Up destination just because its height differs.
    const gap = forward ? near - end : start - far;
    if (gap < -1) return [];
    const low = vertical ? rect.left : rect.top, high = vertical ? rect.right : rect.bottom;
    const crossGap = Math.max(0, low - crossEnd, crossStart - high);
    const aligned = high > crossStart + 1 && low < crossEnd - 1;
    const centerGap = Math.abs((low + high - crossStart - crossEnd) / 2);
    return [{ item, aligned, distance: Math.max(0, gap) + crossGap * 2, centerGap }];
  });
  ranked.sort((a, b) => Number(b.aligned) - Number(a.aligned) || a.distance - b.distance || a.centerGap - b.centerGap);
  return ranked[0]?.item;
}

export function navigationDescription(element: HTMLElement, level: 'brief' | 'detailed', hint = ''): string {
  return isNavigationGroup(element) ? `${navigationGroupName(element)}. Group. Press Enter to go inside. Press Escape to go out to the containing group.` :
    describeElement(element, true, level, hint) || accessibleName(element);
}
