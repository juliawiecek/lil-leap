import { Component, input } from '@angular/core';
import { DashboardIcon } from './dashboard-icon';

/** One headline figure in a page's KPI row; styled by the shared `.kpi` workspace rules. */
@Component({
  selector: 'app-kpi-tile',
  imports: [DashboardIcon],
  // The value's length lets the stylesheet shrink long figures to fit while short ones stay large.
  host: { class: 'kpi', 'data-a11y-read': '', '[attr.data-a11y-label]': 'label()', '[attr.data-a11y-description]': 'value() + ". " + note()', '[style.--kpi-chars]': 'value().length' },
  template: `<span class="kpi-icon"><app-dashboard-icon [name]="icon()" /></span>
    <div>
      <p>{{ label() }}</p>
      <strong [attr.data-testid]="testId()">{{ value() }}</strong>
      @if (note()) {
        <small>{{ note() }}</small>
      }
    </div>`,
})
export class KpiTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly note = input('');
  readonly icon = input('chart');
  readonly testId = input<string | null>(null);
}
