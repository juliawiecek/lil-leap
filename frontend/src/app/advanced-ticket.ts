import { Component, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import type { AdvancedDashboard } from './advanced-dashboard';

@Component({
  selector: 'app-advanced-ticket',
  imports: [CurrencyPipe, DecimalPipe, DashboardIcon],
  templateUrl: './advanced-ticket.html',
  styleUrl: './advanced-ticket.scss',
})
export class AdvancedTicket {
  readonly desk = input.required<AdvancedDashboard>();
}
