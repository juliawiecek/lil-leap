import { Component } from '@angular/core';

/**
 * Every keyboard shortcut NextTrade understands, listed in one place so both dashboards' Keyboard
 * Shortcuts dialogs stay the same (PS-17). Accessibility tickets add theirs here (Alt+B, Alt+W ...).
 */
export interface KeyboardShortcut {
  keys: readonly string[];
  action: string;
}

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  { keys: ['Alt + Shift + A'], action: 'Open Settings for accessibility. Before sign-in, open accessibility tools.' },
  { keys: ['Alt + Shift + R'], action: 'Read the focused element on demand.' },
  { keys: ['Alt + Shift + P'], action: 'Read a concise page summary.' },
  { keys: ['Alt + Shift + X'], action: 'Stop speech immediately, including while typing.' },
  { keys: ['Alt + Shift + Space'], action: 'Pause or resume speech.' },
  { keys: ['?'], action: 'Open this list of shortcuts from anywhere on the dashboard.' },
  { keys: ['Alt + B'], action: 'Play the audio market briefing.' },
  { keys: ['Alt + S'], action: 'Turn switch control on, reading each item aloud, or off. Works on every page.' },
  { keys: ['Tab'], action: 'Move to the next control. Shift + Tab moves back.' },
  { keys: ['Enter'], action: 'Activate the focused button or link, or review an order.' },
  { keys: ['Space'], action: 'Press the focused button or switch.' },
  { keys: ['Esc'], action: 'Close a dialog, clear the search, or stop exploring a chart.' },
  { keys: ['←', '→'], action: 'On a focused chart, step back or forward through its prices.' },
  { keys: ['Home', 'End'], action: 'On a focused chart, jump to its first or latest price.' },
  { keys: ['Tab', 'Enter'], action: 'Focus Explain this chart or Show as table, then activate it. In a tablist, use arrows and Home/End to move; Enter or Space selects.' },
];

/** "?" opens the shortcuts, unless the user is typing in a field or holding a modifier. */
export function isShortcutsKey(event: KeyboardEvent): boolean {
  if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable);
}

/** The shortcut list as it appears in each dashboard's Keyboard Shortcuts dialog. */
@Component({
  selector: 'app-keyboard-shortcuts',
  template: `
    <dl class="shortcut-list">
      @for (shortcut of shortcuts; track shortcut.action) {
        <div>
          <dt>
            @for (key of shortcut.keys; track key; let last = $last) {
              <kbd>{{ key }}</kbd>@if (!last) {<span class="sep" aria-hidden="true">/</span>}
            }
          </dt>
          <dd>{{ shortcut.action }}</dd>
        </div>
      }
    </dl>
  `,
  styles: [
    `
      .shortcut-list { display: grid; gap: 10px; margin: 4px 0 0; }
      .shortcut-list > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; align-items: baseline; }
      dt { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
      dd { margin: 0; line-height: 1.5; }
      kbd { min-width: 22px; padding: 2px 7px; border: 1px solid currentColor; border-radius: 5px; font: inherit; font-size: 12px;
        font-weight: 700; text-align: center; opacity: 0.9; }
      .sep { opacity: 0.6; }
    `,
  ],
})
export class KeyboardShortcuts {
  readonly shortcuts = KEYBOARD_SHORTCUTS;
}
