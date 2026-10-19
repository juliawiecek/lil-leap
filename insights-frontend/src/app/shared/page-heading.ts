import { Component, input } from '@angular/core';
import { UpperCasePipe } from '@angular/common';

/** The eyebrow, title and subtitle every page opens with; actions are projected on the right. */
@Component({
  selector: 'app-page-heading',
  imports: [UpperCasePipe],
  host: { class: 'page-heading' },
  template: `<div>
      <p class="eyebrow">NEXTTRADE / {{ title() | uppercase }}</p>
      <h1>{{ title() }}</h1>
      <p class="subtitle">{{ subtitle() }}</p>
    </div>
    <ng-content />`,
})
export class PageHeading {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
