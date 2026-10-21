import { Component, output } from '@angular/core';
import { BriefingSettingsCard } from './briefing-settings';
import { SwitchScanSettings } from './switch-scan-settings';

/**
 * The Accessibility section of Settings on both dashboards (PS-17). Each accessibility ticket adds
 * its card here, so the novice and advanced Settings pages get it from one place: audio briefing
 * (PS-18), switch control (PS-19), live price updates (PS-21), voice mode (PS-22) and colour-blind
 * mode (PS-27). Every card saves through AccessibilityStore and starts off.
 */
@Component({
  selector: 'app-accessibility-settings',
  imports: [BriefingSettingsCard, SwitchScanSettings],
  template: `
    <section class="a11y" aria-labelledby="accessibility-settings-title" data-scan-group="Accessibility">
      <div class="a11y-intro">
        <h2 id="accessibility-settings-title">Accessibility</h2>
        <p>
          Use NextTrade by ear, with a keyboard or a single switch, and with colours you can tell apart.
          Everything here starts off and is remembered in this browser.
        </p>
      </div>
      <div class="a11y-cards">
        <!-- Feature cards (PS-18, PS-19, PS-21, PS-22, PS-27) go here, one per feature. -->
        <app-briefing-settings />
        <app-switch-scan-settings />
        <div class="a11y-card">
          <span class="a11y-text"
            ><b>Keyboard shortcuts</b><small>Every shortcut NextTrade understands. Press <kbd>?</kbd> anywhere to open the list.</small></span
          >
          <button type="button" class="a11y-button" (click)="openShortcuts.emit()">View shortcuts</button>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .a11y { display: grid; grid-template-columns: minmax(0, 200px) minmax(0, 1fr); gap: 32px; padding: 26px 0; border-top: 1px solid #292d27; }
      .a11y-intro h2 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
      .a11y-intro p { margin: 6px 0 0; color: #a4a79e; font-size: 13px; line-height: 1.55; }
      .a11y-cards { display: grid; gap: 12px; min-width: 0; }
      .a11y-card { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 14px 20px;
        border: 1px solid #262926; border-radius: 8px; background: #111111; }
      .a11y-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .a11y-text b { font-size: 14px; font-weight: 600; }
      .a11y-text small { color: #a4a79e; font-size: 12.5px; line-height: 1.5; }
      kbd { padding: 0 5px; border: 1px solid #3a3f38; border-radius: 4px; font: inherit; font-weight: 700; }
      .a11y-button { flex: none; min-height: 34px; padding: 0 14px; border: 1px solid #3a3f38; border-radius: 8px; background: transparent;
        color: #f2f0e9; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      .a11y-button:hover { border-color: #5a6057; }
      .a11y-button:focus-visible { outline: 2px solid #f2efe6; outline-offset: 2px; }
      @media (max-width: 760px) { .a11y { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 24px 0; } }
      @media (max-width: 480px) { .a11y-card { flex-wrap: wrap; gap: 12px; padding-inline: 12px; } }
    `,
  ],
})
export class AccessibilitySettings {
  /** Asks the dashboard to open its Keyboard Shortcuts dialog. */
  readonly openShortcuts = output<void>();
}
