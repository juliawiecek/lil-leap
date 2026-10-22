import { Directive, ElementRef, afterNextRender, booleanAttribute, inject, input } from '@angular/core';
import { SwitchScanService } from './switch-scan';

/** Focus a newly rendered, user-requested step without taking focus from switch scanning. */
@Directive({ selector: '[appFocusAfterChange]' })
export class FocusAfterChange {
  readonly appFocusAfterChange = input(true, { transform: booleanAttribute });
  constructor() {
    const element = inject(ElementRef<HTMLElement>).nativeElement;
    const scanner = inject(SwitchScanService, { optional: true });
    afterNextRender(() => {
      if (!this.appFocusAfterChange() || scanner?.settings().enabled || !element.isConnected) return;
      if (element.tabIndex < 0) element.setAttribute('tabindex', '-1');
      element.focus({ preventScroll: true });
    });
  }
}
