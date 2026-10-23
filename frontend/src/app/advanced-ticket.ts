import { Component, input } from '@angular/core';
import { PriceFlash } from './price-flash';
import { CurrencyPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import type { AdvancedDashboard } from './advanced-dashboard';

@Component({
  selector: 'app-advanced-ticket',
  imports: [CurrencyPipe, DashboardIcon, PriceFlash],
  templateUrl: './advanced-ticket.html',
  styleUrl: './advanced-ticket.scss',
})
export class AdvancedTicket {
  readonly desk = input.required<AdvancedDashboard>();
}
