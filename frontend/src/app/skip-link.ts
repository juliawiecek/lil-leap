import { DOCUMENT } from '@angular/common';
import { Component, inject, input } from '@angular/core';

/** The id each dashboard gives its <main>, which the skip link moves focus to (PS-20). */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * "Skip to main content": the first stop when tabbing into a dashboard, hidden until focused.
 * The page has <base href="/">, so a plain #fragment link would leave the current page;
 * the click moves focus to the target instead.
 */
@Component({
  selector: 'app-skip-link',
  // Switch control already moves group by group, so its scan leaves the link out (data-scan-ignore).
  template: `<a class="skip-link" data-scan-ignore [attr.href]="'#' + target()" (click)="skip($event)">Skip to main content</a>`,
  styles: [
    `
      .skip-link {
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 1000;
        padding: 10px 16px;
        border-radius: 8px;
        background: var(--surface-raised);
        color: var(--text);
        font-weight: 700;
        text-decoration: none;
        transform: translateY(-200%);
      }
      .skip-link:not(:focus) {
        clip-path: inset(50%);
        width: 1px;
        height: 1px;
        overflow: hidden;
        white-space: nowrap;
      }
      .skip-link:focus {
        transform: none;
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
    `,
  ],
})
export class SkipLink {
  private readonly document = inject(DOCUMENT);
  readonly target = input(MAIN_CONTENT_ID);

  skip(event: Event): void {
    const main = this.document.getElementById(this.target());
    if (!main) {
      return;
    }
    event.preventDefault();
    if (!main.hasAttribute('tabindex')) {
      main.setAttribute('tabindex', '-1');
    }
    main.focus();
    main.scrollIntoView?.({ block: 'start' });
  }
}
