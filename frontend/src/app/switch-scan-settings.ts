import { Component, inject } from '@angular/core';
import { SCAN_KEYS, SCAN_SPEEDS, SwitchScanService } from './switch-scan';

/** Account settings card that turns switch control on and sets its speed and key. */
@Component({
  selector: 'app-switch-scan-settings',
  template: `
    <section class="scan-settings" aria-labelledby="scan-settings-title">
      <div class="scan-heading">
        <div>
          <h3 id="scan-settings-title">Switch control</h3>
          <p>
            Use the whole dashboard with one button. A ring moves through the page; press your switch to choose
            what it is on. Number and text fields open an on-screen keypad. Turn on reading aloud to hear each
            item as the ring reaches it, without needing to see the screen.
          </p>
        </div>
        <button
          type="button"
          class="scan-toggle"
          [attr.aria-pressed]="scan.settings().enabled"
          (click)="scan.update({ enabled: !scan.settings().enabled })"
        >
          {{ scan.settings().enabled ? 'On' : 'Off' }}
        </button>
      </div>
      <div class="scan-options">
        <label
          >Scan speed
          <select (change)="scan.update({ intervalMs: +$any($event.target).value })">
            @for (s of speeds; track s.value) {
              <option [value]="s.value" [selected]="s.value === scan.settings().intervalMs">{{ s.label }}</option>
            }
          </select></label
        >
        <label
          >Switch key
          <select (change)="scan.update({ key: $any($event.target).value })">
            @for (k of keys; track k.value) {
              <option [value]="k.value" [selected]="k.value === scan.settings().key">{{ k.label }}</option>
            }
          </select></label
        >
        <label class="check"
          ><input type="checkbox" [checked]="scan.settings().speak" (change)="scan.update({ speak: $any($event.target).checked })" />
          Read each item aloud</label
        >
      </div>
    </section>
  `,
  styles: [
    `
      .scan-settings { display: grid; gap: 12px; padding: 14px 0; border-top: 1px solid #22323a; }
      .scan-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      h3 { margin: 0 0 4px; font-size: 14px; }
      p { max-width: 52ch; margin: 0; color: #aebaca; font-size: 12px; line-height: 1.5; }
      .scan-toggle { min-width: 64px; min-height: 34px; border: 1px solid #2c3d45; border-radius: 999px; background: #13232a;
        color: #e9f3ee; font: inherit; font-weight: 700; cursor: pointer; }
      .scan-toggle[aria-pressed='true'] { border-color: #51d88c; background: #12301f; color: #8ee6a8; }
      .scan-options { display: flex; flex-wrap: wrap; gap: 14px; }
      label { display: grid; gap: 4px; color: #aebaca; font-size: 12px; }
      label.check { display: flex; align-items: center; gap: 8px; align-self: end; min-height: 32px; color: #e9f3ee; }
      label.check input { width: 18px; height: 18px; margin: 0; accent-color: #51d88c; }
      label.check input:focus-visible { outline: 2px solid #8ee6a8; outline-offset: 2px; }
      select { min-height: 32px; padding: 0 8px; border: 1px solid #2c3d45; border-radius: 6px; background: #13232a; color: #e9f3ee; font: inherit; }
      .scan-toggle:focus-visible, select:focus-visible { outline: 2px solid #8ee6a8; outline-offset: 2px; }
    `,
  ],
})
export class SwitchScanSettings {
  readonly scan = inject(SwitchScanService);
  readonly speeds = SCAN_SPEEDS;
  readonly keys = SCAN_KEYS;
}
