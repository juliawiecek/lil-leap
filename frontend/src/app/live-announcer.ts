import { Injectable, inject } from '@angular/core';

/**
 * Screen reader announcements (PS-21). Messages that appear in a part of the page that is not
 * focused, such as "Order filled" or a rejection, are only heard when they land in a live region
 * that was already on the page before the text changed. This service keeps one polite and one
 * assertive region at the end of the page, created up front, and puts each message into one of
 * them. Screens never show these regions; the visible text stays where it was.
 */

export type Politeness = 'polite' | 'assertive';

/** How long a region stays empty before the next message, so the same words said twice are heard twice. */
export const ANNOUNCE_DELAY_MS = 100;
/** Messages kept in `history`, newest last. */
const HISTORY = 50;

@Injectable({ providedIn: 'root' })
export class LiveAnnouncer {
  /** What was announced, newest last, so the wording can be checked without a screen reader. */
  readonly history: { text: string; politeness: Politeness }[] = [];
  readonly #regions = new Map<Politeness, HTMLElement>();
  readonly #timers = new Map<Politeness, ReturnType<typeof setTimeout>>();
  /** Text waiting to go into each region. */
  readonly #pending = new Map<Politeness, string>();

  constructor() {
    // Created before the first message: text added together with its region is often not read.
    this.#region('polite');
    this.#region('assertive');
  }

  /** Reads a message to screen reader users; assertive interrupts, polite waits for a pause. */
  announce(text: string, politeness: Politeness = 'polite'): void {
    const message = text.trim();
    if (!message) {
      return;
    }
    this.history.push({ text: message, politeness });
    this.history.splice(0, this.history.length - HISTORY);
    const region = this.#region(politeness);
    if (!region) {
      return;
    }
    // A message that arrives before the last one reached the region joins it, in order, so a fast
    // order ("Order sent", then "Filled" moments later) is still heard in full.
    const pending = this.#pending.get(politeness);
    this.#pending.set(politeness, pending ? `${pending} ${message}` : message);
    clearTimeout(this.#timers.get(politeness));
    region.textContent = '';
    this.#timers.set(
      politeness,
      setTimeout(() => {
        region.textContent = this.#pending.get(politeness) ?? '';
        this.#pending.delete(politeness);
      }, ANNOUNCE_DELAY_MS),
    );
  }

  /**
   * The live region for a politeness, created at the end of the page if needed; null with no page.
   * While a modal dialog is open everything outside it is hidden from screen readers, so the
   * region moves into the dialog (and back out once it closes) before the message is written.
   */
  #region(politeness: Politeness): HTMLElement | null {
    const doc = globalThis.document;
    if (!doc?.body) {
      return null;
    }
    const host = openModal(doc) ?? doc.body;
    let region = this.#regions.get(politeness);
    if (!region) {
      region = doc.createElement('div');
      region.className = 'sr-only';
      region.setAttribute('aria-live', politeness);
      region.setAttribute('aria-atomic', 'true');
      region.dataset['announcer'] = politeness;
      this.#regions.set(politeness, region);
    }
    if (region.parentElement !== host) {
      host.append(region);
    }
    return region;
  }
}

/** The modal dialog on top, if one is open. */
function openModal(doc: Document): HTMLElement | null {
  const open = [...doc.querySelectorAll<HTMLDialogElement>('dialog[open]')].reverse();
  return (
    open.find((dialog) => {
      try {
        return dialog.matches(':modal');
      } catch {
        // Engines without :modal: a dialog marked aria-modal still hides the page around it.
        return dialog.getAttribute('aria-modal') === 'true';
      }
    }) ?? null
  );
}

/**
 * The app's shared announcer. Services also run outside Angular in plain unit tests, where there
 * is no injector; they get an announcer of their own.
 */
export function liveAnnouncer(): LiveAnnouncer {
  try {
    return inject(LiveAnnouncer, { optional: true }) ?? new LiveAnnouncer();
  } catch {
    return new LiveAnnouncer();
  }
}
