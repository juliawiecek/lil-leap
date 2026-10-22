import { Component, inject, output } from '@angular/core';
import { BriefingSettingsCard } from './briefing-settings';
import { SwitchScanSettings } from './switch-scan-settings';
import { ColourModeStore } from './colour-mode';
import { SpeechService } from './speech';

/**
 * The Accessibility section of Settings on both dashboards (PS-17). Each accessibility ticket adds
 * its card here, so the novice and advanced Settings pages get it from one place: audio briefing
 * (PS-18), switch control (PS-19), captions (PS-23), live price updates (PS-21), voice mode (PS-22) and colour-blind
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
        <fieldset class="a11y-card colour-mode" aria-describedby="colour-mode-help">
          <legend>Colour-blind mode</legend>
          <p id="colour-mode-help">Choose colours you can tell apart. Prices and calculations stay the same.</p>
          <div class="colour-options">
            @for (option of colourOptions; track option.value) {
              <label class="colour-option">
                <input type="radio" name="colour-mode" [value]="option.value"
                  [checked]="colours.mode() === option.value" (change)="colours.set(option.value)" />
                <span>{{ option.label }}</span>
              </label>
            }
          </div>
        </fieldset>
        <!-- Feature cards (PS-18, PS-19, PS-21, PS-22, PS-27) go here, one per feature. -->
        <app-briefing-settings />
        <app-switch-scan-settings />
        <div class="a11y-card">
          <span class="a11y-text"
            ><b id="caption-settings-title">Captions</b
            ><small id="caption-settings-help"
              >Show what NextTrade says aloud in a strip at the bottom of the screen: switch control, the order read-back, the
              briefing and <kbd>Alt</kbd> + <kbd>W</kbd> explanations. On unless you turn it off.</small
            ></span
          >
          <button
            type="button"
            class="a11y-button caption-toggle"
            aria-labelledby="caption-settings-title"
            aria-describedby="caption-settings-help"
            [attr.aria-pressed]="speech.settings().show"
            (click)="speech.setCaptions(!speech.settings().show)"
          >
            {{ speech.settings().show ? 'On' : 'Off' }}
          </button>
        </div>
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
      .a11y { display: grid; grid-template-columns: minmax(0, 200px) minmax(0, 1fr); gap: 32px; padding: 26px 0; border-top: 1px solid var(--surface-tone-05); }
      .a11y-intro h2 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
      .a11y-intro p { margin: 6px 0 0; color: var(--text-muted); font-size: 13px; line-height: 1.55; }
      .a11y-cards { display: grid; gap: 12px; min-width: 0; }
      .a11y-card.colour-mode { display: block; margin: 0; min-width: 0; }
      .colour-mode legend { padding: 0 4px; font-size: 14px; font-weight: 600; }
      .colour-mode p { margin: 0 0 12px; color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
      .colour-options { display: flex; flex-wrap: wrap; gap: 8px; }
      .colour-option { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px;
        border: 1px solid var(--control-border); border-radius: 8px; color: var(--text); cursor: pointer; }
      .colour-option:has(:checked) { background: var(--selection-surface); border-color: var(--focus); }
      .colour-option:hover { border-color: var(--focus); }
      .colour-option:focus-within { outline: 2px solid var(--focus); outline-offset: 3px; }
      .colour-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--buy); }
      .a11y-card { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 14px 20px;
        border: 1px solid var(--surface-tone-04); border-radius: 8px; background: var(--surface-tone-03); }
      .a11y-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .a11y-text b { font-size: 14px; font-weight: 600; }
      .a11y-text small { color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
      kbd { padding: 0 5px; border: 1px solid var(--surface-tone-02); border-radius: 4px; font: inherit; font-weight: 700; }
      .a11y-button { flex: none; min-height: 34px; padding: 0 14px; border: 1px solid var(--surface-tone-02); border-radius: 8px; background: transparent;
        color: var(--text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      .a11y-button:hover { border-color: var(--surface-tone-01); }
      .caption-toggle { min-width: 64px; border-radius: 999px; font-weight: 700; }
      .caption-toggle[aria-pressed='true'] { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
      .a11y-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      @media (max-width: 760px) { .a11y { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 24px 0; } }
      @media (max-width: 480px) { .a11y-card { flex-wrap: wrap; gap: 12px; padding-inline: 12px; } }
    `,
  ],
})
export class AccessibilitySettings {
  readonly colours = inject(ColourModeStore);
  /** The caption strip's on/off switch (PS-23). */
  readonly speech = inject(SpeechService);
  readonly colourOptions = [
    { value: 'off', label: 'Off' },
    { value: 'red-green', label: 'Red-green safe' },
    { value: 'blue-yellow', label: 'Blue-yellow safe' },
  ] as const;
  /** Asks the dashboard to open its Keyboard Shortcuts dialog. */
  readonly openShortcuts = output<void>();
}
