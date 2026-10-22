import { Component, computed, input, output, viewChild } from '@angular/core';
import { NoviceDashboard } from './novice-dashboard';
import { AdvancedDashboard } from './advanced-dashboard';
import { SkipLink } from './skip-link';
import type { UserProfile } from './auth-api';

export type Experience = 'NOVICE' | 'ADVANCED';

@Component({
  selector: 'app-stock-dashboard',
  imports: [NoviceDashboard, AdvancedDashboard, SkipLink],
  templateUrl: './stock-dashboard.html',
  styles: [':host { display: block; } [hidden] { display: none !important; }'],
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class StockDashboard {
  readonly name = input('');
  readonly profile = input<UserProfile | null>(null);
  readonly profileLoading = input(false);
  readonly profileError = input('');
  /** The server-assigned tier from the access token; users can't switch tiers themselves (NEXT-152). */
  readonly level = input<Experience>('NOVICE');
  readonly newAccount = input(false);
  readonly signOut = output<void>();
  readonly mode = computed(() => this.level());
  readonly novice = viewChild(NoviceDashboard);

  /**
   * "?" opens Keyboard Shortcuts on the novice dashboard (PS-17). Its own document listener was
   * lost in a merge; the advanced dashboard still listens for itself.
   */
  onKeydown(event: KeyboardEvent): void {
    this.novice()?.onShortcutKey(event);
  }
}
