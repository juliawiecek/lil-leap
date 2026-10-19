import { Component } from '@angular/core';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { PageHeading } from '../../shared/page-heading';

/** Analyst reports page (TS-18.4); the By Stock, By Period and By Client Segment reports are TS-18.6. */
@Component({
  selector: 'app-reports-page',
  imports: [DashboardIcon, PageHeading],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {}
