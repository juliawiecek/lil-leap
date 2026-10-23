import { Component, computed, input, output, signal } from '@angular/core';

export interface MenuOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A dropdown in the site's own style, used in place of the browser's select where its native menu clashes
 * with the dark theme: a dark field with a chevron and a list that always opens below it and scrolls inside
 * itself. Arrow keys, Home/End, Enter, Escape and typing a letter to jump all work, and screen readers hear
 * a combobox with a listbox. The page keeps a hidden native control beside it for form validation.
 */
@Component({
  selector: 'app-select-menu',
  template: `
    <div class="menu-picker" (focusout)="open.set(false)">
      <button
        type="button"
        class="menu-trigger"
        role="combobox"
        aria-haspopup="listbox"
        [id]="triggerId()"
        [attr.aria-labelledby]="labelledBy() ? labelledBy() + ' ' + triggerId() : null"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-controls]="triggerId() + '-list'"
        [attr.aria-expanded]="open()"
        [attr.aria-activedescendant]="open() ? triggerId() + '-' + index() : null"
        [class.invalid]="invalid()"
        [class.empty]="!selected()"
        [disabled]="disabled()"
        (click)="toggle()"
        (keydown)="key($event)"
      >
        <span class="menu-value">{{ selected()?.label || placeholder() }}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      @if (open()) {
        <ul class="menu-list" role="listbox" [id]="triggerId() + '-list'" [attr.aria-labelledby]="labelledBy()">
          @for (option of options(); track option.value; let i = $index) {
            <li
              role="option"
              [id]="triggerId() + '-' + i"
              [attr.aria-selected]="option.value === value()"
              [class.active]="i === index()"
              (mousedown)="$event.preventDefault()"
              (mouseenter)="index.set(i)"
              (click)="pick(option.value)"
            >{{ option.label }}</li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .menu-picker { position: relative; }
      .menu-trigger {
        display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 50px;
        padding: 0 14px 0 16px; border: 1px solid var(--surface-tone-08); border-radius: var(--menu-radius, 10px); background: var(--menu-bg, var(--background));
        color: var(--text); font: inherit; font-size: 15px; font-weight: 500; text-align: left; cursor: pointer;
      }
      .menu-trigger.empty { color: var(--text-subtle); }
      .menu-trigger:hover, .menu-trigger[aria-expanded='true'] { border-color: var(--text-muted); }
      .menu-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .menu-trigger.invalid { border-color: color-mix(in srgb, var(--loss) 55%, transparent); }
      .menu-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
      .menu-value { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .menu-trigger svg { flex: none; width: 16px; height: 16px; fill: none; stroke: var(--text-muted); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
      .menu-trigger[aria-expanded='true'] svg { transform: rotate(180deg); }
      .menu-list {
        position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; right: 0; max-height: 260px;
        margin: 0; padding: 6px; overflow-y: auto; list-style: none;
        border: 1px solid var(--surface-tone-08); border-radius: 12px; background: var(--surface); box-shadow: 0 18px 40px var(--shadow-92);
      }
      .menu-list li { padding: 10px 12px; border-radius: 8px; color: var(--text); font-size: 14px; cursor: pointer; }
      .menu-list li.active { background: var(--text-wash-07); }
      .menu-list li[aria-selected='true'] { font-weight: 700; }
    `,
  ],
})
export class SelectMenu {
  readonly options = input<readonly MenuOption[]>([]);
  readonly value = input('');
  readonly placeholder = input('Select an option');
  readonly triggerId = input.required<string>();
  readonly labelledBy = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly picked = output<string>();

  readonly open = signal(false);
  readonly index = signal(0);
  readonly selected = computed(() => this.options().find((option) => option.value === this.value()) ?? null);

  toggle(): void {
    if (!this.open()) {
      this.index.set(Math.max(this.options().findIndex((option) => option.value === this.value()), 0));
    }
    this.open.set(!this.open());
  }

  pick(value: string): void {
    this.picked.emit(value);
    this.open.set(false);
  }

  key(event: KeyboardEvent): void {
    const last = this.options().length - 1;
    if (!this.open()) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.toggle();
      }
      return;
    }
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 6, PageUp: -6 };
    if (event.key in moves) {
      event.preventDefault();
      this.highlight(Math.min(last, Math.max(0, this.index() + moves[event.key])));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.highlight(event.key === 'Home' ? 0 : last);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = this.options()[this.index()];
      if (option) {
        this.pick(option.value);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.open.set(false);
    } else if (event.key === 'Tab') {
      this.open.set(false);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Typing a letter jumps to the next option that starts with it (handy for the long state list).
      const letter = event.key.toLowerCase();
      const options = this.options();
      for (let step = 1; step <= options.length; step++) {
        const at = (this.index() + step) % options.length;
        if (options[at].label.toLowerCase().startsWith(letter)) {
          this.highlight(at);
          break;
        }
      }
    }
  }

  /** Moves the highlight and keeps that row in view inside the scrolling list. */
  private highlight(at: number): void {
    this.index.set(at);
    queueMicrotask(() => globalThis.document?.getElementById(`${this.triggerId()}-${at}`)?.scrollIntoView?.({ block: 'nearest' }));
  }
}
