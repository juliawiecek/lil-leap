import { Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { SiteAccessibility } from './site-accessibility';
let settingsId = 0;
@Component({
  selector: 'app-assistive-settings',
  templateUrl: '../../../shared/assistive-settings.html',
  styleUrls: ['../../../shared/assistive-tools.scss', './assistive-settings.scss'],
})
export class AssistiveSettings {
  readonly access = inject(SiteAccessibility);
  readonly prefix = `assistive-settings-${++settingsId}`;
}
@Component({
  selector: 'app-assistive-tools', imports: [AssistiveSettings],
  templateUrl: '../../../shared/assistive-tools.html', styleUrl: '../../../shared/assistive-tools.scss',
  host: { 'data-a11y-tools': '' },
})
export class AssistiveTools {
  readonly access = inject(SiteAccessibility);
  readonly panel = viewChild<ElementRef<HTMLDialogElement>>('panel');
  readonly id = 'site-accessibility-tools';
  private trigger: HTMLElement | null = null;
  constructor() {
    this.access.controller.openSettings = () => this.open();
    inject(DestroyRef).onDestroy(() => { this.access.controller.openSettings = () => {}; });
  }
  open(): void {
    if (!this.access.loginPage()) { this.access.openSettings(); return; }
    const dialog = this.panel()?.nativeElement;
    if (dialog && !dialog.open) {
      this.trigger = dialog.ownerDocument.activeElement as HTMLElement;
      dialog.showModal();
    }
  }
  close(): void { this.panel()?.nativeElement.close(); }
  closed(): void { if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true }); }
  backdrop(event: Event): void { if (event.target === this.panel()?.nativeElement) this.close(); }
}
