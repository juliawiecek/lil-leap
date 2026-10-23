import { Component } from '@angular/core';
import { AssistiveSettings } from '../../assistive-tools';
import { PageHeading } from '../../shared/page-heading';

@Component({
  selector: 'app-settings-page',
  imports: [PageHeading, AssistiveSettings],
  template: `<app-page-heading title="Settings" subtitle="Personalize your accessibility preferences for this browser." />
    <section aria-labelledby="insights-accessibility-title">
      <h2 id="insights-accessibility-title">Accessibility</h2>
      <app-assistive-settings />
    </section>`,
  styles: [`section { max-width: 760px; } h2 { color: var(--nt-text); font-size: 20px; margin: 24px 0 16px; }`],
})
export class SettingsPage {}
