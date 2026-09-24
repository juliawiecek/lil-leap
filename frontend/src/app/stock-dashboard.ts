import { Component, computed, input, output } from '@angular/core';
import { NoviceDashboard } from './novice-dashboard';
import { AdvancedDashboard } from './advanced-dashboard';

export type Experience = 'NOVICE' | 'ADVANCED';

@Component({
  selector: 'app-stock-dashboard',
  imports: [NoviceDashboard, AdvancedDashboard],
  templateUrl: './stock-dashboard.html',
  styles: [':host { display: block; } [hidden] { display: none !important; }'],
})
export class StockDashboard {
  readonly name = input('');
  /** The server-assigned tier from the access token; users can't switch tiers themselves (NEXT-152). */
  readonly level = input<Experience>('NOVICE');
  readonly newAccount = input(false);
  readonly signOut = output<void>();
  readonly mode = computed(() => this.level());
}
