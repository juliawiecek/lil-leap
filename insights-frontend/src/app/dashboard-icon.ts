import { Component, input } from '@angular/core';

@Component({
  selector: 'app-dashboard-icon',
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="paths[name()] || paths['arrow']" />
  </svg>`,
  styles: [
    ':host { display: inline-flex; width: 20px; height: 20px; flex: 0 0 auto; } svg { width: 100%; height: 100%; }',
  ],
})
export class DashboardIcon {
  readonly name = input('arrow');
  readonly paths: Record<string, string> = {
    users:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87',
    user: 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    coins:
      'M21 5c0 2-4 3-9 3S3 7 3 5s4-3 9-3 9 1 9 3ZM3 5v5c0 2 4 3 9 3s9-1 9-3V5M3 10v5c0 2 4 3 9 3s9-1 9-3v-5M3 15v4c0 2 4 3 9 3s9-1 9-3v-4',
    calendar: 'M3 5h18v16H3ZM7 2v6M17 2v6M3 10h18M7 14h2m3 0h2m3 0h1',
    info: 'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    home: 'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10M8 7V4H5v6',
    chart: 'M3 21V11h4v10M10 21V6h4v15M17 21V2h4v19',
    orders: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    file: 'M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8M8 16h8',
    learn: 'm2 9 10-5 10 5-10 5ZM6 11v7l6 3 6-3v-7M22 9v8',
    settings:
      'm9 3 1-2h4l1 2 3 2 3 0 2 4-2 2v3l2 2-2 4-3-1-3 2-1 2h-4l-1-2-3-2-3 1-2-4 2-2v-3L1 9l2-4h3ZM16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0',
    search: 'M17 10a7 7 0 1 0-14 0 7 7 0 0 0 14 0M15 15l6 6',
    bell: 'M5 9a7 7 0 0 1 14 0c0 7 2 8 2 8H3s2-1 2-8M10 21h4',
    arrow: 'M6 18 18 6M6 6h12v12',
    shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM12 6v12M6 8l12-3M6 9v3c0 3 6 6 6 6',
  };
}
