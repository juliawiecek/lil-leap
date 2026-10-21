import { Component, inject } from '@angular/core';
import { BRIEFING_RATES, BRIEFING_REPEATS, BriefingService } from './briefing-button';

/** Audio briefing card in Settings > Accessibility (PS-18): voice speed and automatic repeats. */
@Component({
  selector: 'app-briefing-settings',
  template: `
    <section class="card" aria-labelledby="briefing-settings-title" data-scan-group="Audio briefing">
      <span class="card-text">
        <b id="briefing-settings-title">Audio briefing</b>
        <small>
          A short spoken summary of the market, your portfolio and your recent orders. Play it with the Briefing button
          or <kbd>Alt</kbd> + <kbd>B</kbd>. With your balance hidden, amounts are never read out.
        </small>
      </span>
      <div class="card-options">
        <label
          >Voice speed
          <select (change)="briefing.update({ rate: +$any($event.target).value })">
            @for (r of rates; track r.value) {
              <option [value]="r.value" [selected]="r.value === briefing.settings().rate">{{ r.label }}</option>
            }
          </select></label
        >
        <label
          >Repeat
          <select (change)="briefing.update({ everyMinutes: +$any($event.target).value })">
            @for (r of repeats; track r.value) {
              <option [value]="r.value" [selected]="r.value === briefing.settings().everyMinutes">{{ r.label }}</option>
            }
          </select></label
        >
      </div>
    </section>
  `,
  styles: [
    `
      .card { display: grid; gap: 14px; padding: 14px 20px; border: 1px solid var(--surface-tone-04); border-radius: 8px; background: var(--surface-tone-03); }
      .card-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .card-text b { font-size: 14px; font-weight: 600; }
      .card-text small { max-width: 56ch; color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
      kbd { padding: 0 5px; border: 1px solid var(--surface-tone-02); border-radius: 4px; font: inherit; font-weight: 700; }
      .card-options { display: flex; flex-wrap: wrap; align-items: end; gap: 14px; }
      label { display: grid; gap: 4px; color: var(--text-muted); font-size: 12px; }
      select { min-height: 32px; padding: 0 8px; border: 1px solid var(--surface-tone-02); border-radius: 8px; background: var(--on-accent); color: var(--text); font: inherit; }
      select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      @media (max-width: 480px) { .card { padding-inline: 12px; } }
    `,
  ],
})
export class BriefingSettingsCard {
  readonly briefing = inject(BriefingService);
  readonly rates = BRIEFING_RATES;
  readonly repeats = BRIEFING_REPEATS;
}
