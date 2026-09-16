import { Component, input, output, signal, OnInit } from '@angular/core';
import { NoviceDashboard } from './novice-dashboard';
import { AdvancedDashboard } from './advanced-dashboard';

export type Experience = 'NOVICE' | 'ADVANCED';

@Component({
  selector: 'app-stock-dashboard',
  imports: [NoviceDashboard, AdvancedDashboard],
  templateUrl: './stock-dashboard.html',
  styles: [':host { display: block; } [hidden] { display: none !important; }'],
})
export class StockDashboard implements OnInit {
  readonly name = input('');
  readonly level = input<Experience>('NOVICE');
  readonly newAccount = input(false);
  readonly signOut = output<void>();
  readonly mode = signal<Experience>('NOVICE');
  ngOnInit(): void {
    this.mode.set(this.level());
  }
  setMode(value: Experience): void {
    this.mode.set(value);
  }
}
