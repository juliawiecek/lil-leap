import { Component, inject } from '@angular/core';
import { ColorModeService } from './color-mode';

/** Account settings card that switches gains and losses to color-blind friendly colors. */
@Component({
  selector: 'app-color-mode-settings',
  template: `
    <section class="color-settings" aria-labelledby="color-settings-title">
      <div class="color-heading">
        <div>
          <h3 id="color-settings-title">Color-blind friendly colors</h3>
          <p>
            Shows gains in blue and losses in orange, a pair people with color blindness can tell apart, and marks
            every rise and fall with an arrow so color is never the only clue.
          </p>
        </div>
        <button
          type="button"
          class="color-toggle"
          [attr.aria-pressed]="on()"
          (click)="colors.set(on() ? 'standard' : 'colorblind')"
        >
          {{ on() ? 'On' : 'Off' }}
        </button>
      </div>
      <p class="preview" aria-hidden="true">
        <span class="sample gain">+2.40%</span><span class="sample loss">−1.15%</span>
      </p>
    </section>
  `,
  styles: [
    `
      .color-settings { display: grid; gap: 10px; padding: 14px 0; border-top: 1px solid #22323a; }
      .color-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      h3 { margin: 0 0 4px; font-size: 14px; }
      p { max-width: 52ch; margin: 0; color: #aebaca; font-size: 12px; line-height: 1.5; }
      .color-toggle { min-width: 64px; min-height: 34px; border: 1px solid #2c3d45; border-radius: 999px; background: #13232a;
        color: #e9f3ee; font: inherit; font-weight: 700; cursor: pointer; }
      .color-toggle[aria-pressed='true'] { border-color: #51d88c; background: #12301f; color: #8ee6a8; }
      .color-toggle:focus-visible { outline: 2px solid #8ee6a8; outline-offset: 2px; }
      .preview { display: flex; gap: 14px; font-size: 13px; font-weight: 700; }
      .sample.gain { color: var(--gain, #51d88c); }
      .sample.loss { color: var(--loss, #ff5e66); }
    `,
  ],
})
export class ColorModeSettings {
  readonly colors = inject(ColorModeService);

  on(): boolean {
    return this.colors.mode() === 'colorblind';
  }
}
