import { Component, Injectable, inject, output, signal } from '@angular/core';

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

  show(kind: ToastKind, title: string, detail = ''): number {
    const id = this.#nextId++;
    this.toasts.update((list) => [...list, { id, kind, title, detail }].slice(-MAX_TOASTS));
    this.#timers.set(id, setTimeout(() => this.dismiss(id), TOAST_MS[kind]));
    return id;
  }

  dismiss(id: number): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}

/** Renders the toasts in the bottom-right corner; "View" asks the dashboard to open the orders list. */
@Component({
  selector: 'app-toasts',
  template: `
    <section class="toasts" aria-live="polite" aria-label="Order updates">
      @for (toast of service.toasts(); track toast.id) {
        <div class="toast" [class.rejected]="toast.kind === 'rejected'" [attr.role]="toast.kind === 'rejected' ? 'alert' : 'status'">
          <div>
            <strong>{{ toast.title }}</strong>
            @if (toast.detail) {
              <p>{{ toast.detail }}</p>
            }
          </div>
          <div class="actions">
            <button type="button" class="view" (click)="view.emit(); service.dismiss(toast.id)">View</button>
            <button type="button" class="close" aria-label="Dismiss" (click)="service.dismiss(toast.id)">×</button>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .toasts { position: fixed; z-index: 60; right: 16px; bottom: 16px; display: grid; gap: 10px; width: min(360px, calc(100vw - 32px)); }
      .toast { display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid #2e4424;
        border-left: 4px solid #94c973; border-radius: 8px; background: #121a0f; color: #c6e2b2; box-shadow: 0 16px 40px #0008;
        font-size: 12px; animation: enter 0.2s ease-out; }
      .toast.rejected { border-color: #4a2a24; border-left-color: #ff7a6e; background: #1e0f0d; }
      strong { display: block; font-size: 13px; }
      p { margin: 4px 0 0; color: #d6d4cc; line-height: 1.5; }
      .actions { display: flex; align-items: flex-start; gap: 6px; }
      button { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
      .view { color: #c6e2b2; font-weight: 600; }
      .rejected .view { color: #ffb4ab; }
      .close { font-size: 16px; line-height: 1; color: #a4a79e; }
      @keyframes enter { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
    `,
  ],
})
export class Toasts {
  readonly service = inject(ToastService);
  readonly view = output<void>();
}
