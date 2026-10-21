import { Component, inject } from '@angular/core';
import { SCAN_BACK_PROMPTS, SCAN_KEYS, SCAN_PAUSE_PROMPTS, SCAN_SPEEDS, SwitchScanService } from './switch-scan';

/** Switch control card in Settings > Accessibility (PS-19): on/off, speed, switch key, read aloud. */
@Component({
  selector: 'app-switch-scan-settings',
  template: `
    <section class="card" aria-labelledby="scan-settings-title" data-scan-group="Switch control">
      <div class="card-top">
        <span class="card-text">
          <b id="scan-settings-title">Switch control</b>
          <small>
            Use the whole dashboard with one button. A ring moves through the page; press your switch to choose
            what it is on. Number and text fields open an on-screen keypad. Press <kbd>Alt</kbd> + <kbd>S</kbd> on any
            page to turn it on with every item read aloud, or off.
          </small>
        </span>
        <button
          type="button"
          class="scan-toggle"
          aria-labelledby="scan-settings-title"
          [attr.aria-pressed]="scan.settings().enabled"
          (click)="scan.update({ enabled: !scan.settings().enabled })"
        >
          {{ scan.settings().enabled ? 'On' : 'Off' }}
        </button>
      </div>
      <div class="card-options">
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
        <label
          >Offer "Go back?"
          <select (change)="scan.update({ backEverySec: +$any($event.target).value })">
            @for (p of backPrompts; track p.value) {
              <option [value]="p.value" [selected]="p.value === scan.settings().backEverySec">{{ p.label }}</option>
            }
          </select></label
        >
        <label
          >Offer "Pause?"
          <select (change)="scan.update({ pauseEverySec: +$any($event.target).value })">
            @for (p of pausePrompts; track p.value) {
              <option [value]="p.value" [selected]="p.value === scan.settings().pauseEverySec">{{ p.label }}</option>
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
      .card { display: grid; gap: 14px; padding: 14px 20px; border: 1px solid var(--surface-tone-04); border-radius: 8px; background: var(--surface-tone-03); }
      .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
      .card-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .card-text b { font-size: 14px; font-weight: 600; }
      .card-text small { max-width: 56ch; color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
      kbd { padding: 0 5px; border: 1px solid var(--surface-tone-02); border-radius: 4px; font: inherit; font-weight: 700; }
      .scan-toggle { flex: none; min-width: 64px; min-height: 34px; border: 1px solid var(--surface-tone-02); border-radius: 999px; background: transparent;
        color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
      .scan-toggle[aria-pressed='true'] { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
      .card-options { display: flex; flex-wrap: wrap; align-items: end; gap: 14px; }
      label { display: grid; gap: 4px; color: var(--text-muted); font-size: 12px; }
      select { min-height: 32px; padding: 0 8px; border: 1px solid var(--surface-tone-02); border-radius: 8px; background: var(--background);
        color: var(--text); font: inherit; }
      label.check { display: flex; align-items: center; gap: 8px; min-height: 32px; color: var(--text); font-size: 13px; }
      label.check input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); }
      .scan-toggle:focus-visible, select:focus-visible, label.check input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
      @media (max-width: 480px) { .card { padding-inline: 12px; } .card-top { flex-wrap: wrap; gap: 12px; } }
    `,
  ],
})
export class SwitchScanSettings {
  readonly scan = inject(SwitchScanService);
  readonly speeds = SCAN_SPEEDS;
  readonly keys = SCAN_KEYS;
  readonly backPrompts = SCAN_BACK_PROMPTS;
  readonly pausePrompts = SCAN_PAUSE_PROMPTS;
}
