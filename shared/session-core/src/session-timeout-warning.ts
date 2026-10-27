import { Component, ElementRef, InjectionToken, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { SessionCoordinator } from './app-session.service.js';

/** Apps stop their briefing and deliver the warning through their shared speech channel. */
export const SESSION_WARNING_ANNOUNCE = new InjectionToken<(text: string) => void>('SESSION_WARNING_ANNOUNCE', {
  providedIn: 'root', factory: () => () => {},
});

/** "0:42" for the countdown people see. */
export function countdownClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** "1 minute", "42 seconds" for screen readers, which would read "0:42" as a time of day. */
export function countdownWords(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (minutes === 0) {
    return part(rest, 'second');
  }
  return rest === 0 ? part(minutes, 'minute') : `${part(minutes, 'minute')} ${part(rest, 'second')}`;
}

/**
 * The "Still there?" warning before the inactivity sign-out (PS-30, WCAG 2.2.1). A native
 * modal dialog, so it sits above any other dialog, keeps keyboard focus inside, and is picked
 * up by switch control, which scans an open modal dialog and reads its buttons aloud. As an
 * alertdialog, screen readers announce its title and message as soon as it opens.
 */
@Component({
  selector: 'lil-session-timeout-warning',
  template: `
    <dialog
      #dialog
      class="session-warning"
      role="alertdialog"
      aria-labelledby="session-warning-title"
      aria-describedby="session-warning-message"
      (cancel)="onCancel($event)"
    >
      <h2 id="session-warning-title">Still there?</h2>
      <span class="session-warning-live" role="alert" aria-live="assertive" aria-atomic="true">{{ announcement() }}</span>
      <p id="session-warning-message">
        For your security, you'll be signed out in
        <span class="session-warning-time" aria-hidden="true">{{ clock() }}</span
        ><span class="session-warning-sr">{{ words() }}</span>
        because there's been no activity.
      </p>
      <div class="session-warning-actions">
        <button #stay type="button" class="session-warning-stay" (click)="staySignedIn()">
          Stay signed in
        </button>
        <button type="button" class="session-warning-leave" (click)="signOut()">Sign out</button>
      </div>
    </dialog>
  `,
  // Theme tokens from NextTrade first, then Insights' own, then system colours, so the one
  // shared dialog matches either app and still works in forced-colours mode.
  styles: [
    `
      .session-warning {
        width: min(420px, calc(100vw - 32px));
        padding: 24px;
        border: 1px solid var(--surface-tone-02, var(--nt-border, CanvasText));
        border-radius: 12px;
        background: var(--surface-raised, var(--nt-background, Canvas));
        color: var(--text, var(--nt-text, CanvasText));
        font: inherit;
      }
      .session-warning::backdrop {
        background: color-mix(in srgb, var(--background, var(--nt-background, Canvas)) 75%, transparent);
      }
      h2 {
        margin: 0 0 8px;
        font-size: 1.25rem;
      }
      p {
        margin: 0 0 20px;
        color: var(--text-muted, var(--nt-muted, CanvasText));
        line-height: 1.5;
      }
      .session-warning-time {
        color: var(--text, var(--nt-text, CanvasText));
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .session-warning-live, .session-warning-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .session-warning-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      button {
        min-height: 44px;
        padding: 0 18px;
        border-radius: 8px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .session-warning-stay {
        border: 1px solid transparent;
        background: var(--accent, var(--nt-green, ButtonText));
        color: var(--on-accent, var(--nt-background, ButtonFace));
      }
      .session-warning-leave {
        border: 1px solid var(--surface-tone-02, var(--nt-border, ButtonText));
        background: transparent;
        color: var(--text, var(--nt-text, ButtonText));
      }
      button:focus-visible {
        outline: 3px solid var(--focus, var(--nt-green, Highlight));
        outline-offset: 2px;
      }
    `,
  ],
})
export class SessionTimeoutWarning {
  readonly announcement = signal('');
  private readonly announce = inject(SESSION_WARNING_ANNOUNCE);
  readonly session = input.required<SessionCoordinator>();
  readonly secondsLeft = computed(() => this.session().warningSecondsLeft());
  readonly clock = computed(() => countdownClock(this.secondsLeft() ?? 0));
  readonly words = computed(() => countdownWords(this.secondsLeft() ?? 0));
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly stayButton = viewChild<ElementRef<HTMLButtonElement>>('stay');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      const warning = this.secondsLeft() !== null;
      if (!dialog || warning === dialog.open) {
        return;
      }
      if (warning) {
        dialog.showModal();
        const text = `Still there? For your security, you'll be signed out in ${this.words()} because there's been no activity. Choose Stay signed in to continue.`;
        this.announcement.set(text);
        this.announce(text);
        // The safe choice gets focus, so Enter, a click or one switch press keeps the session.
        this.stayButton()?.nativeElement.focus();
      } else {
        this.announcement.set('');
        dialog.close();
      }
    });
  }

  staySignedIn(): void {
    this.session().staySignedIn();
  }

  signOut(): void {
    void this.session().logout();
  }

  /** Escape means "not now", so it keeps the session rather than leaving a timer running unseen. */
  onCancel(event: Event): void {
    event.preventDefault();
    this.staySignedIn();
  }
}
