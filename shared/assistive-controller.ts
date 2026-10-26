import { applyAssistiveVisuals, type AssistivePreferences } from './assistive-preferences.ts';
import { accessibleName, describeElement, readableText } from './accessible-description.ts';
import { speechCoordinator as speech } from './speech-coordinator.ts';

export interface AssistiveOptions {
  settings: () => AssistivePreferences;
  status: (text: string) => void;
  state: (speaking: boolean, paused: boolean) => void;
  voices: (voices: SpeechSynthesisVoice[]) => void;
  scanning?: () => boolean;
  stopScanningSpeech?: () => void;
  format?: (text: string) => string;
  hint?: (element: Element) => string;
}
const INTERACTIVE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="tab"], [role="img"], [data-a11y-read]';
const INFORMATION = 'h1, h2, h3, p, dt, dd, td, th, output, [data-a11y-read]';
const editable = (element: Element | null) => !!element?.matches('input, textarea, select, [contenteditable="true"]');
/** Automatic (polite) reading: focus and hover. */
const POLITE = ['assist:focus', 'assist:hover'];
/** The same phrase is not said again within this time. */
const REPEAT_GAP_MS = 500;
const visible = (element: Element) => !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
  element.ownerDocument.defaultView?.getComputedStyle(element).display !== 'none';

/** One delegated event layer, independent of Angular renders and real-time prices. */
export class AssistiveController {
  openSettings: () => void = () => {};
  private keyboard = false;
  private pointerReady = false;
  private lastTarget: HTMLElement | null = null;
  private hovered: Element | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | undefined;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private routeTimer: ReturnType<typeof setTimeout> | undefined;
  private formTimer: ReturnType<typeof setTimeout> | undefined;
  private highlight: Element | null = null;
  private previousPath: string | undefined;
  private previousUrl = '';
  private errorId = 0;
  private lastPhrase = '';
  private lastPhraseAt = 0;
  private invalidFocusScheduled = false;
  private disposers: (() => void)[] = [];
  private dialogTriggers = new WeakMap<Element, HTMLElement>();
  private readonly document: Document;
  private readonly options: AssistiveOptions;
  constructor(document: Document, options: AssistiveOptions) { this.document = document; this.options = options; }
  start(): void {
    const doc = this.document;
    const listen = (name: string, fn: EventListener) => {
      doc.addEventListener(name, fn, true); this.disposers.push(() => doc.removeEventListener(name, fn, true));
    };
    listen('keydown', event => this.key(event as KeyboardEvent));
    listen('pointerdown', () => { this.keyboard = false; this.cancelPending(); });
    listen('focusin', event => this.focus(event.target as HTMLElement));
    listen('focusout', () => { clearTimeout(this.focusTimer); speech.stop('assist:focus'); });
    listen('pointerover', event => this.pointer(event as PointerEvent));
    listen('pointermove', event => { this.pointerReady = true; this.pointer(event as PointerEvent); });
    listen('pointerout', event => {
      if (this.hovered && !this.hovered.contains((event as PointerEvent).relatedTarget as Node | null)) {
        clearTimeout(this.hoverTimer); this.hovered = null; speech.stop('assist:hover');
      }
    });
    listen('invalid', event => this.invalid(event));
    listen('input', event => this.clearError(event.target as HTMLInputElement));
    listen('submit', event => this.submit(event));
    listen('beforetoggle', event => this.dialog(event as Event & { newState?: string }));
    // Dismiss popovers before an outside pointer action; never activate a financial control.
    listen('click', event => this.dismissOutside(event.target as Element));
    const voices = () => this.options.voices(globalThis.speechSynthesis?.getVoices?.().filter(voice => voice.localService) ?? []);
    globalThis.speechSynthesis?.addEventListener?.('voiceschanged', voices);
    this.disposers.push(() => globalThis.speechSynthesis?.removeEventListener?.('voiceschanged', voices));
    voices();
    speech.configure(() => this.options.settings());
    this.disposers.push(speech.subscribe((_owner, active) => {
      this.options.state(speech.speaking, speech.paused);
      if (!active && !speech.speaking) this.clearHighlight();
    }));
    this.apply();
  }
  apply(): void {
    applyAssistiveVisuals(this.document.documentElement, this.options.settings());
    this.cancelPending();
    if (!this.options.settings().enabled) { speech.stop('assist:focus'); speech.stop('assist:hover'); }
    if (!this.options.settings().highlightSpeech) this.clearHighlight();
  }
  private cancelPending(): void { clearTimeout(this.focusTimer); clearTimeout(this.hoverTimer); }
  private clearHighlight(): void { this.highlight?.removeAttribute('data-a11y-speaking'); this.highlight = null; }
  private meaningful(target: Element | null, informational = false): HTMLElement | null {
    if (!target?.closest || target.closest('[data-a11y-reading-action], [inert], [hidden]')) return null;
    // Closest interactive ancestor wins over its nested decorative text/icon.
    const element = target.closest(INTERACTIVE) ?? (informational ? target.closest(INFORMATION) : null);
    return element?.closest('[aria-hidden="true"]') ? null : element as HTMLElement | null;
  }
  private focus(target: HTMLElement): void {
    const element = this.meaningful(target, true);
    if (element && !element.closest('[data-a11y-tools]')) this.lastTarget = element;
    clearTimeout(this.focusTimer);
    if (!element || !this.keyboard || !this.options.settings().enabled || !this.options.settings().focus || this.options.scanning?.()) return;
    speech.stop('assist:focus');
    this.focusTimer = setTimeout(() => {
      if (element.isConnected && this.document.activeElement === element) this.read(element, 'assist:focus');
    }, 180);
  }
  private pointer(event: PointerEvent): void {
    if (!this.pointerReady || event.pointerType === 'touch') return;
    const element = this.meaningful(event.target as Element, true);
    if (element === this.hovered) return;
    clearTimeout(this.hoverTimer);
    this.hovered = element;
    const settings = this.options.settings();
    if (!settings.enabled || !settings.hover || !element || this.options.scanning?.() ||
        element.closest('[data-a11y-sensitive]') || element.matches('input[type="password"]')) return;
    this.hoverTimer = setTimeout(() => {
      if (element.isConnected && this.hovered === element && visible(element)) this.read(element, 'assist:hover');
    }, settings.hoverDelay);
  }
  private say(text: string, owner: string, target?: Element, requested = false, interrupt = requested): boolean {
    if (!text) { if (requested) this.options.status('There is no readable content selected.'); return false; }
    if (!speech.supported) { if (requested) this.options.status('Speech is unavailable in this browser. Native screen readers and keyboard navigation still work.'); return false; }
    const voices = globalThis.speechSynthesis?.getVoices?.();
    if (voices && !voices.some(voice => voice.localService)) {
      if (requested) this.options.status('A local voice is not available yet. Install a local system voice or try again when voices have loaded.');
      return false;
    }
    const spoken = this.options.format?.(text) ?? text;
    // A redraw, or focus and hover landing on the same item, never says one phrase twice in a row.
    const now = Date.now();
    if (!requested && spoken === this.lastPhrase && now - this.lastPhraseAt < REPEAT_GAP_MS) return false;
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = this.options.settings().rate;
    if (requested) this.cancelPending();
    // Focus and hover are one polite stream: fast moves replace the item being read, so only the
    // last one is heard. Polite speech never cuts in on anything else, such as a playing briefing.
    if (POLITE.includes(owner)) POLITE.filter(other => other !== owner).forEach(other => speech.stop(other));
    const started = speech.submit(owner, utterance, { interrupt, queue: !interrupt && owner === 'assist:announce' });
    if (started) { this.lastPhrase = spoken; this.lastPhraseAt = now; }
    if (started && target && this.options.settings().highlightSpeech) {
      this.clearHighlight(); this.highlight = target; target.setAttribute('data-a11y-speaking', '');
    }
    // Automatic speech does not duplicate a live-region/screen-reader focus announcement.
    if (requested) this.options.status(started ? 'Reading. Use Stop speech at any time.' : 'Another reading is in progress.');
    return started;
  }
  private read(element: Element, owner: string, requested = false): void {
    // The level is read per item, so changing it takes effect on the next item.
    this.say(describeElement(element, requested, this.options.settings().level, this.options.hint?.(element)), owner, element, requested);
  }
  /**
   * Speaks a message from the app while voice assistance is on: "Voice assistance on.", an order
   * fill or rejection. `urgent` cuts in on whatever is being read, since a trade outcome cannot
   * wait; otherwise it waits its turn like other reading. Silent while voice assistance is off.
   */
  announce(text: string, urgent = false): boolean {
    if (!this.options.settings().enabled) return false;
    return this.say(text, urgent ? 'assist:alert' : 'assist:announce', undefined, false, urgent);
  }
  /** Escape: stops the sentence being read, without a status message, and leaves every setting alone. */
  private hush(): void {
    this.cancelPending(); this.options.stopScanningSpeech?.(); speech.stop();
    this.clearHighlight(); this.options.state(false, false);
  }
  readFocused(): void {
    const element = this.lastTarget;
    if (element?.isConnected) this.read(element, 'assist:request', true);
    else this.options.status('Focus an element on the page, then choose Read focused element.');
  }
  readSection(): void {
    const selection = this.document.getSelection();
    const anchor = selection?.anchorNode?.parentElement;
    const selected = anchor && !anchor.closest('input, textarea, [data-a11y-sensitive], [data-a11y-tools]') ? selection?.toString().trim() : '';
    const section = this.lastTarget?.closest('section, article, form, [role="region"], header, nav, aside');
    const text = selected || (section ? readableText(section, 2500) : '');
    this.say(text, 'assist:request', section ?? undefined, true);
  }
  readPage(): void {
    const main = [...this.document.querySelectorAll('main')].find(visible);
    if (!main) { this.options.status('The page is loading. Try Read page summary again.'); return; }
    const headings = [...main.querySelectorAll('h1,h2')].filter(visible).map(node => readableText(node, 120)).filter(Boolean);
    const alerts = [...main.querySelectorAll('[role="alert"]')].filter(visible).map(node => readableText(node, 200));
    const figures = [...main.querySelectorAll('[data-a11y-read]')].filter(visible).slice(0, 2)
      .map(node => describeElement(node, true, this.options.settings().level, this.options.hint?.(node))).join(' ');
    const text = `${headings.shift() || this.document.title}. ${headings.length ? 'Sections: ' + headings.slice(0, 10).join('; ') + '.' : ''} ${figures} ${alerts.join('. ')} Use Tab to move through controls, or Read section for details.`;
    this.say(text, 'assist:request', main, true);
  }
  stop(): void {
    this.cancelPending(); this.options.stopScanningSpeech?.(); speech.stop();
    this.clearHighlight(); this.options.state(false, false); this.options.status('Speech stopped.');
  }
  pause(): void {
    if (speech.paused) speech.resume(); else speech.pause();
    this.options.state(speech.speaking, speech.paused);
    this.options.status(speech.paused ? 'Speech paused.' : 'Speech resumed.');
  }
  routeChanged(url: string): void {
    const path = url.split(/[?#]/)[0];
    this.cancelPending(); speech.stop('assist:focus'); speech.stop('assist:hover'); speech.stop('assist:request');
    if (this.previousUrl && url !== this.previousUrl) {
      const owner = speech.owner;
      if (owner.startsWith('chart:') || owner === 'briefing') speech.stop(owner);
    }
    this.previousUrl = url;
    const changed = this.previousPath !== undefined && this.previousPath !== path;
    this.previousPath = path;
    if (!changed || this.options.scanning?.()) return;
    clearTimeout(this.routeTimer);
    this.routeTimer = setTimeout(() => {
      if (this.options.scanning?.()) return;
      const main = this.document.querySelector<HTMLElement>('main:not([aria-hidden="true"])');
      const target = main?.querySelector<HTMLElement>('h1') ?? main;
      if (target && !this.document.querySelector('dialog[open]')) {
        target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true });
        target.scrollIntoView?.({ block: 'nearest' });
      }
    }, 80);
  }
  private key(event: KeyboardEvent): void {
    if (typeof event.key !== 'string' || event.isComposing) return;
    const element = event.target as HTMLElement;
    if (!element?.closest) return;
    // Escape stops the current speech while voice assistance is on (or reading it started), then
    // still does its usual job of closing a dialog or popup.
    if (event.key === 'Escape' && speech.speaking && (this.options.settings().enabled || speech.owner.startsWith('assist:'))) this.hush();
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.repeat) {
      const action = ({ r: () => this.readFocused(), p: () => this.readPage(), x: () => this.stop(), a: () => this.openSettings(), ' ': () => this.pause() } as Record<string, (() => void) | undefined>)[event.key.toLowerCase()];
      if (action && (!editable(element) || event.key.toLowerCase() === 'x')) { event.preventDefault(); action(); return; }
    }
    if (event.key === 'Tab' || event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
      this.keyboard = true; clearTimeout(this.hoverTimer); speech.stop('assist:hover');
    }
    if (event.key === 'Tab') this.prepareComposites();
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || this.options.scanning?.()) return;
    const tablist = element.closest('[role="tablist"]');
    if (tablist && element.getAttribute('role') === 'tab') {
      const vertical = tablist.getAttribute('aria-orientation') === 'vertical';
      const previous = vertical ? 'ArrowUp' : 'ArrowLeft', next = vertical ? 'ArrowDown' : 'ArrowRight';
      if ([previous, next, 'Home', 'End'].includes(event.key)) {
        const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter(tab => !tab.disabled);
        const at = tabs.indexOf(element as HTMLButtonElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === previous ? -1 : 1) + tabs.length) % tabs.length;
        event.preventDefault(); tabs.forEach((tab, i) => tab.tabIndex = i === index ? 0 : -1);
        // Manual activation: arrows move focus; Space/Enter retains the native button action.
        tabs[index]?.focus(); return;
      }
    }
    const search = element.closest('[data-a11y-search]');
    if (search && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const input = search.querySelector<HTMLInputElement>('input');
      const results = [...search.querySelectorAll<HTMLButtonElement>('[data-a11y-results] button')];
      if (results.length && (element !== input || event.key === 'ArrowDown')) {
        const at = results.indexOf(element as HTMLButtonElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? results.length - 1 : at + (event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault(); (index < 0 ? input : results[Math.min(index, results.length - 1)])?.focus(); return;
      }
    }
    if (event.key === 'Escape' && !this.document.querySelector('dialog[open]')) {
      if (search) {
        const input = search.querySelector<HTMLInputElement>('input');
        if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
      }
      this.dismissOutside(null);
    }
  }
  private prepareComposites(): void {
    for (const list of this.document.querySelectorAll('[role="tablist"]')) {
      const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
      const active = tabs.includes(this.document.activeElement as HTMLElement) ? this.document.activeElement : tabs.find(tab => tab.getAttribute('aria-selected') === 'true') ?? tabs[0];
      tabs.forEach(tab => tab.tabIndex = tab === active ? 0 : -1);
    }
  }
  private dismissOutside(target: Element | null): void {
    for (const popup of this.document.querySelectorAll<HTMLElement>('[data-a11y-popover]')) {
      const trigger = [...this.document.querySelectorAll<HTMLElement>('[aria-controls]')].find(button => button.getAttribute('aria-controls') === popup.id && button.getAttribute('aria-expanded') === 'true');
      if (trigger && !popup.contains(target) && !trigger.contains(target)) {
        const returnFocus = !target && popup.contains(this.document.activeElement);
        trigger.click(); if (returnFocus) trigger.focus();
      }
    }
  }
  private dialog(event: Event & { newState?: string }): void {
    const dialog = event.target as HTMLDialogElement;
    if (dialog.tagName !== 'DIALOG') return;
    if (event.newState === 'open') {
      const active = this.document.activeElement as HTMLElement;
      if (active && active !== this.document.body && !dialog.contains(active)) this.dialogTriggers.set(dialog, active);
    } else if (event.newState === 'closed') {
      this.cancelPending(); speech.stop('assist:focus');
      const trigger = this.dialogTriggers.get(dialog);
      if (trigger?.isConnected && visible(trigger)) queueMicrotask(() => trigger.focus({ preventScroll: true }));
    }
  }
  private invalid(event: Event): void {
    const field = event.target as HTMLInputElement;
    if (!field.setAttribute || !field.validationMessage) return;
    event.preventDefault();
    let id = field.getAttribute('data-a11y-error');
    if (!id) { id = `a11y-field-error-${++this.errorId}`; field.setAttribute('data-a11y-error', id); }
    let error = this.document.getElementById(id);
    if (!error) {
      error = this.document.createElement('p'); error.id = id; error.className = 'a11y-field-error';
      // Keep validation text out of a wrapping label's accessible name.
      (field.closest('label') ?? field).insertAdjacentElement('afterend', error);
    }
    error.textContent = `${accessibleName(field) || 'This field'}: ${field.validationMessage}`;
    field.setAttribute('aria-invalid', 'true');
    const ids = new Set((field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)); ids.add(id);
    field.setAttribute('aria-describedby', [...ids].join(' '));
    if (!this.invalidFocusScheduled) {
      this.invalidFocusScheduled = true;
      queueMicrotask(() => {
        this.invalidFocusScheduled = false;
        if (field.isConnected) field.focus();
      });
    }
  }
  private clearError(field: HTMLInputElement): void {
    const id = field.getAttribute?.('data-a11y-error');
    if (!id) return;
    this.document.getElementById(id)?.remove();
    const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(value => value && value !== id);
    if (ids.length) field.setAttribute('aria-describedby', ids.join(' ')); else field.removeAttribute('aria-describedby');
    field.removeAttribute('aria-invalid');
  }
  private submit(event: Event): void {
    const form = event.target as HTMLFormElement;
    if (form.tagName !== 'FORM') return;
    if (!form.checkValidity()) {
      event.preventDefault(); event.stopImmediatePropagation();
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return;
    }
    clearTimeout(this.formTimer);
    this.formTimer = setTimeout(() => {
      const error = form.querySelector<HTMLElement>('[role="alert"], .form-status, .ticket-message, output');
      if (error?.textContent?.trim()) {
        error.id ||= `a11y-form-message-${++this.errorId}`;
        const ids = new Set((form.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)); ids.add(error.id);
        form.setAttribute('aria-describedby', [...ids].join(' '));
      }
    }, 80);
  }
  destroy(): void {
    this.cancelPending(); clearTimeout(this.routeTimer); clearTimeout(this.formTimer);
    this.disposers.splice(0).forEach(dispose => dispose());
    this.clearHighlight(); speech.stop('assist:focus'); speech.stop('assist:hover'); speech.stop('assist:request');
  }
}
