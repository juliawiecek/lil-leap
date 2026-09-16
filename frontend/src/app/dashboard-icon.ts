import { Component, input } from '@angular/core';

@Component({
  selector: 'app-dashboard-icon',
  template: `<svg
    viewBox="0 0 24 24"
    [attr.fill]="name() === 'apple' ? 'currentColor' : 'none'"
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
    chat: 'M21 11a9 9 0 1 0-16 6l-2 4 5-2a9 9 0 0 0 13-8Z',
    keyboard: 'M3 5h18v14H3ZM6 8h1m3 0h1m3 0h1m3 0h1M6 11h1m3 0h1m3 0h1m3 0h1M7 15h10',
    moon: 'M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z',
    collapse: 'm11 6-6 6 6 6m7-12-6 6 6 6',
    home: 'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10M8 7V4H5v6',
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
    chart: 'M3 21V11h4v10M10 21V6h4v15M17 21V2h4v19',
    orders: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    file: 'M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8M8 16h8',
    learn: 'm2 9 10-5 10 5-10 5ZM6 11v7l6 3 6-3v-7M22 9v8',
    settings:
      'm9 3 1-2h4l1 2 3 2 3 0 2 4-2 2v3l2 2-2 4-3-1-3 2-1 2h-4l-1-2-3-2-3 1-2-4 2-2v-3L1 9l2-4h3ZM16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0',
    search: 'M17 10a7 7 0 1 0-14 0 7 7 0 0 0 14 0M15 15l6 6',
    bell: 'M5 9a7 7 0 0 1 14 0c0 7 2 8 2 8H3s2-1 2-8M10 21h4',
    chevron: 'm9 5 7 7-7 7',
    down: 'm6 9 6 6 6-6',
    arrow: 'M6 18 18 6M6 6h12v12',
    eye: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM12 6v12M6 8l12-3M6 9v3c0 3 6 6 6 6',
    more: 'M12 4h.01M12 12h.01M12 20h.01',
    close: 'm6 6 12 12M6 18 18 6',
    apple:
      'M15 6c1-1 2-3 1-5-2 0-4 2-4 4M12 7C7 3 2 8 4 15c1 4 3 7 5 7l3-1 3 1c2 0 4-3 5-6-5-2-5-6-1-8-2-3-5-2-7-1Z',
  };
}
