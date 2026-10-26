import { Component, inject } from '@angular/core';
import { CaptionService } from './captions';

/** Captions card in Settings > Accessibility (PS-23): show what NextTrade says aloud, on or off. */
@Component({
  selector: 'app-caption-settings',
  template: `
    <section class="card" aria-labelledby="caption-settings-title" data-scan-group="Captions">
      <span class="card-text">
        <b id="caption-settings-title">Captions</b>
        <small id="caption-settings-help">
          Show what NextTrade says aloud in a strip at the bottom of the screen: switch control, the order read-back,
          the briefing and <kbd>Alt</kbd> + <kbd>W</kbd> explanations. On unless you turn it off.
        </small>
      </span>
      <button
        type="button"
        class="caption-toggle"
        aria-labelledby="caption-settings-title"
        aria-describedby="caption-settings-help"
        [attr.aria-pressed]="captions.settings().show"
        (click)="captions.setCaptions(!captions.settings().show)"
      >
        {{ captions.settings().show ? 'On' : 'Off' }}
      </button>
    </section>
  `,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .card { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: var(--setting-card-padding, 14px 20px);
        border: var(--setting-card-border, 1px solid var(--surface-tone-04)); border-bottom: var(--setting-card-divider, 1px solid var(--surface-tone-04));
        border-radius: var(--setting-card-radius, 8px); background: var(--setting-card-bg, var(--surface-tone-03)); }
      .card-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .card-text b { font-size: 14px; font-weight: 600; }
      .card-text small { max-width: 56ch; color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
      kbd { padding: 0 5px; border: 1px solid var(--surface-tone-02); border-radius: 4px; font: inherit; font-weight: 700; }
      .caption-toggle { flex: none; min-width: 64px; min-height: 34px; border: 1px solid var(--surface-tone-02); border-radius: 999px; background: transparent;
        color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
      /* The same on/off tints as the switch control toggle (the palette's loss and gain, so colour-blind modes follow). */
      .caption-toggle[aria-pressed='false'] { border-color: color-mix(in srgb, var(--loss) 40%, transparent); background: color-mix(in srgb, var(--loss) 10%, transparent); color: var(--loss); }
      .caption-toggle[aria-pressed='true'] { border-color: color-mix(in srgb, var(--gain) 45%, transparent); background: color-mix(in srgb, var(--gain) 14%, transparent); color: var(--gain); }
      .caption-toggle:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
      @media (max-width: 480px) { .card { flex-wrap: wrap; gap: 12px; padding-inline: 12px; } }
    `,
  ],
})
export class CaptionSettingsCard {
  readonly captions = inject(CaptionService);
}
