import { Component, inject } from '@angular/core';
import { SwitchScanService } from './switch-scan';
@Component({
  selector: 'app-switch-scan-toggle',
  template: `<button type="button" [attr.aria-pressed]="scan.settings().enabled" (click)="scan.update({ enabled: !scan.settings().enabled, speak: true })">Switch control {{ scan.settings().enabled ? 'On' : 'Off' }}</button>`,
  styles: [`button { font: inherit; color: inherit; background: transparent; border: 1px solid currentColor; border-radius: 6px; padding: 8px 12px; min-height: 44px; cursor: pointer; } button:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }`],
})
export class SwitchScanToggle { readonly scan = inject(SwitchScanService); }
