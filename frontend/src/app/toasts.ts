import { Component, ElementRef, Injectable, inject, output, signal } from '@angular/core';
import { StatusBadge } from './status-badge';
import { soundCuePlayer } from './sound-cue-player';

export type ToastKind = 'filled' | 'rejected' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail: string;
}

/** Fills disappear quickly; rejections stay longer so the reason can be read (PS-15). */
export const TOAST_MS: Record<ToastKind, number> = { filled: 6000, rejected: 12000, info: 6000 };
/** Older toasts give way so the corner never fills the screen. */
const MAX_TOASTS = 3;

/** Small corner messages that dismiss themselves. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  #nextId = 1;
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly #cues = soundCuePlayer();

  readonly #held = new Map<number, Set<string>>();
  #observer?: MutationObserver;
  #modal = false;
  #watch(): void {
    const doc = globalThis.document;
    if (!doc || this.#observer) return;
    const Observer = doc.defaultView?.MutationObserver;
    if (!Observer) return;
    this.#observer = new Observer(() => this.modalChanged());
    this.#observer.observe(doc, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    doc.addEventListener('close', this.#closed, true);
    this.#modal = !!doc.querySelector('dialog[open]');
  }
  readonly #closed = () => this.modalChanged();
  modalChanged(): void {
    const open = !!globalThis.document?.querySelector('dialog[open]');
    if (open === this.#modal) return;
    this.#modal = open;
    for (const toast of this.toasts()) {
      if (open) clearTimeout(this.#timers.get(toast.id));
      else this.#start(toast);
    }
  }
  hold(id: number, reason: string): void {
    const reasons = this.#held.get(id) ?? new Set<string>(); reasons.add(reason); this.#held.set(id, reasons);
    clearTimeout(this.#timers.get(id));
  }
  release(id: number, reason: string): void {
    this.#held.get(id)?.delete(reason);
    const toast = this.toasts().find(item => item.id === id);
    if (toast) this.#start(toast);
  }
  #start(toast: Toast): void {
    clearTimeout(this.#timers.get(toast.id));
    if (this.#held.get(toast.id)?.size || globalThis.document?.querySelector('dialog[open]')) return;
    this.#timers.set(toast.id, setTimeout(() => {
      if (globalThis.document?.querySelector('dialog[open]')) { this.#modal = true; return; }
      this.dismiss(toast.id);
    }, TOAST_MS[toast.kind]));
  }
  ngOnDestroy(): void {
    this.#observer?.disconnect(); globalThis.document?.removeEventListener('close', this.#closed, true);
    this.#timers.forEach(clearTimeout); this.#timers.clear();
  }

  show(kind: ToastKind, title: string, detail = ''): number {
    this.#watch();
    const id = this.#nextId++;
    for (const old of this.toasts().slice(0, Math.max(0, this.toasts().length - MAX_TOASTS + 1))) this.dismiss(old.id);
    const toast = { id, kind, title, detail };
    this.toasts.update(list => [...list, toast]);
    this.#start(toast);
    // A chime for a fill, a low tone for a rejection (PS-22); the toast is the written message.
    if (kind !== 'info') {
      this.#cues.play(kind === 'filled' ? 'fill' : 'reject');
    }
    return id;
  }

  dismiss(id: number): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.#held.delete(id);
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}

/** Renders the toasts in the bottom-right corner; "View" asks the dashboard to open the orders list. */
@Component({
  selector: 'app-toasts',
  imports: [StatusBadge],
  template: `
    <!-- Not a live region (PS-21): the dashboards announce each order step once through the live announcer. -->
    <section class="toasts" aria-label="Order updates">
      @for (toast of service.toasts(); track toast.id) {
        <div class="toast" (mouseenter)="service.hold(toast.id, 'hover')" (mouseleave)="service.release(toast.id, 'hover')"
          (focusin)="service.hold(toast.id, 'focus')" (focusout)="leaveFocus($event, toast.id)" [class.rejected]="toast.kind === 'rejected'">
          <div>
            <strong><app-status-badge [value]="toast.kind" /> · {{ toast.title }}</strong>
            @if (toast.detail) {
              <p>{{ toast.detail }}</p>
            }
          </div>
          <div class="actions">
            <button type="button" class="view" (click)="view.emit(); service.dismiss(toast.id)">View</button>
            <button type="button" class="close" [attr.aria-label]="'Dismiss ' + toast.title" (click)="service.dismiss(toast.id)">×</button>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .toasts { position: fixed; z-index: 60; right: 16px; bottom: 16px; display: grid; gap: 10px; width: min(360px, calc(100vw - 32px)); }
      .toast { display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--gain-tone-22);
        border-left: 4px solid var(--gain); border-radius: 8px; background: var(--surface-tone-09); color: var(--gain-tone-21); box-shadow: 0 16px 40px var(--shadow-40);
        font-size: 12px; animation: enter 0.2s ease-out; }
      .toast.rejected { border-color: var(--loss-tone-15); border-left-color: var(--loss); background: var(--surface-tone-105); }
      strong { display: block; font-size: 13px; }
      p { margin: 4px 0 0; color: var(--text-tone-19); line-height: 1.5; }
      .actions { display: flex; align-items: flex-start; gap: 6px; }
      button { min-width: 24px; min-height: 24px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
      .view { color: var(--gain-tone-21); font-weight: 600; }
      .rejected .view { color: var(--loss-tone-06); }
      .close { font-size: 16px; line-height: 1; color: var(--text-muted); }
      @keyframes enter { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
    `,
  ],
})
export class Toasts {
  readonly service = inject(ToastService);
  readonly view = output<void>();
  readonly #host = inject(ElementRef<HTMLElement>, { optional: true });
  #anchor?: Comment;
  #observer?: MutationObserver;
  leaveFocus(event: FocusEvent, id: number): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.service.release(id, 'focus');
  }
  ngAfterViewInit(): void {
    const host = this.#host?.nativeElement;
    if (!host?.parentNode) return;
    this.#anchor = host.ownerDocument.createComment('toast location'); host.before(this.#anchor);
    const move = () => {
      const modal = [...host.ownerDocument.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
      if (modal && host.parentNode !== modal) modal.append(host);
      else if (!modal && this.#anchor?.parentNode && host.previousSibling !== this.#anchor) this.#anchor.after(host);
      this.service.modalChanged();
    };
    const Observer = host.ownerDocument.defaultView!.MutationObserver;
    this.#observer = new Observer(move); this.#observer.observe(host.ownerDocument, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] }); move();
  }
  ngOnDestroy(): void { this.#observer?.disconnect(); this.#anchor?.remove(); }

}
