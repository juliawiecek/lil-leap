import { Component } from '@angular/core';
import { DashboardIcon } from '../../shared/dashboard-icon';
import { PageHeading } from '../../shared/page-heading';

/** Analyst client accounts page (TS-18.4); the account list and detail are built in TS-18.5. */
@Component({
  selector: 'app-clients-page',
  imports: [DashboardIcon, PageHeading],
  templateUrl: './clients-page.html',
  styleUrl: './clients-page.scss',
})
export class ClientsPage {}
