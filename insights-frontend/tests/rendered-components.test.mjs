import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, browser, animateFrame } from './dom-helper.mjs';
import { provideRouter, Router } from '@angular/router';
const { DashboardIcon } = await import('../src/app/shared/dashboard-icon.ts');
const { InsightsChart } = await import('../src/app/shared/insights-chart.ts');
const { Shell } = await import('../src/app/shell/shell.ts');
const { ReportsPage } = await import('../src/app/pages/reports/reports-page.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { AppSessionService } = await import('../src/app/app-session.service.ts');

test('insights icons bind known names and fall back for unknown names', async t => {
  const fixture = await render(t, DashboardIcon, { name: 'users' });
  const path = fixture.nativeElement.querySelector('path');
  assert.equal(path.getAttribute('d'), fixture.componentInstance.paths.users);
  fixture.componentRef.setInput('name', 'missing'); fixture.detectChanges();
  assert.equal(path.getAttribute('d'), fixture.componentInstance.paths.arrow);
  assert.equal(fixture.nativeElement.querySelector('svg').getAttribute('aria-hidden'), 'true');
});

test('chart renders empty state, binds points, follows the pointer and the keyboard, and glides to new values', async t => {
  const fixture = await render(t, InsightsChart);
  assert.match(fixture.nativeElement.textContent, /No observations/);
  fixture.componentRef.setInput('points', [{ label: '2026-09-01', value: 1234 }, { label: '2026-09-02', value: 2500 }]);
  fixture.componentRef.setInput('label', 'Filtered volume'); fixture.detectChanges();
  const svg = fixture.nativeElement.querySelector('svg');
  assert.equal(svg.getAttribute('aria-label'), 'Filtered volume');
  assert.equal(svg.getAttribute('tabindex'), '0', 'one tab stop for the whole chart');
  assert.match(fixture.nativeElement.querySelector('.chart-readout').textContent, /arrow keys/);
  assert.match(fixture.nativeElement.querySelector('.area').getAttribute('fill'), /^url\(#insights-chart-fill-\d+\)$/);
  svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' })); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.cursor-label').textContent, /2026-09-01 · \$1,234/);
  svg.dispatchEvent(new Event('blur')); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('.cursor-label'), null);
  svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' })); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.cursor-label').textContent, /2,500/);
  svg.dispatchEvent(new Event('pointerleave')); fixture.detectChanges();
  assert.equal(fixture.componentInstance.active(), null);

  const chart = fixture.componentInstance;
  const before = chart.path();
  fixture.componentRef.setInput('points', [{ label: 'a', value: 1234 }, { label: 'b', value: 900 }, { label: 'c', value: 3000 }]);
  fixture.detectChanges();
  const target = chart.placed();
  assert.equal(chart.shown().length, 3, 'the added point grows out of the old last point');
  assert.deepEqual(chart.shown()[2], chart.shown()[1]);
  assert.notDeepEqual(chart.shown(), target);
  const started = performance.now();
  animateFrame(started + 120);
  assert.notEqual(chart.path(), before);
  assert.notDeepEqual(chart.shown(), target, 'halfway through the glide');
  animateFrame(started + 1000);
  assert.deepEqual(chart.shown(), target, 'the glide ends exactly on the real values');

  fixture.componentRef.setInput('points', [{ label: 'a', value: 5 }, { label: 'b', value: 6 }]);
  fixture.detectChanges();
  svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
  assert.deepEqual(chart.shown(), chart.placed(), 'using the chart finishes a glide at once');
});

const signedInAs = (role, session = { logout: async () => {} }) => [
  provideRouter([]),
  { provide: AuthService, useValue: { userRole: role, email: `${role.toLowerCase()}@nexttrade.local` } },
  { provide: AppSessionService, useValue: session },
];
const navLabels = (fixture) => [...fixture.nativeElement.querySelectorAll('nav a span')].map(span => span.textContent.trim());
const navGroups = (fixture) => [...fixture.nativeElement.querySelectorAll('nav .nav-group')].map(p => p.textContent.trim());

test('analysts see the three reporting pages, and the header shows who is signed in', async t => {
  const fixture = await render(t, Shell, {}, signedInAs('ANALYST'));
  assert.deepEqual(navLabels(fixture), ['Insights', 'Clients', 'Reports']);
  assert.deepEqual(navGroups(fixture), ['Analytics']);
  assert.match(fixture.nativeElement.querySelector('.identity').textContent, /analyst@nexttrade\.local.*Analyst/s);
  assert.equal(fixture.nativeElement.querySelector('.avatar').textContent.trim(), 'A');
  assert.equal(fixture.nativeElement.querySelector('header select'), null, 'the role is never chosen in the page');
});

test('operations staff see everything analysts see, plus the trade lookup', async t => {
  const fixture = await render(t, Shell, {}, signedInAs('OPERATIONS'));
  assert.deepEqual(navLabels(fixture), ['Insights', 'Clients', 'Reports', 'Trade lookup']);
  assert.deepEqual(navGroups(fixture), ['Analytics', 'Operations']);
  assert.equal(fixture.componentInstance.home(), '/insights');
  assert.match(fixture.nativeElement.querySelector('.identity').textContent, /Operations/);
});

test('sign-out ends the session and returns to the sign-in page', async t => {
  const calls = [];
  const fixture = await render(t, Shell, {}, signedInAs('ANALYST', { logout: async () => { calls.push('logout'); } }));
  const router = fixture.debugElement.injector.get(Router);
  t.mock.method(router, 'navigate', async (parts, options) => { calls.push({ parts, options }); return true; });
  await fixture.componentInstance.signOut();
  assert.deepEqual(calls, ['logout', { parts: ['/login'], options: { replaceUrl: true } }]);
});

test('report download creates a CSV blob, clicks its filename, and revokes the URL', async t => {
  const fixture = await render(t, ReportsPage);
  let blob; const revoked = [];
  t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:report'; });
  t.mock.method(URL, 'revokeObjectURL', value => revoked.push(value));
  const clicks = [];
  t.mock.method(browser.HTMLAnchorElement.prototype, 'click', function () { clicks.push({ href: this.href, download: this.download }); });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  fixture.componentInstance.download({ name: 'Trading Activity Report', csv: 'Symbol,Quantity\r\nAAPL,2' });
  assert.equal(blob.type, 'text/csv;charset=utf-8');
  // Blob text decoding strips the UTF-8 BOM; verify its bytes separately.
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)], [239, 187, 191]);
  assert.match(await blob.text(), /AAPL,2/);
  assert.deepEqual(clicks, [{ href: 'blob:report', download: 'trading-activity-report.csv' }]);
  assert.deepEqual(revoked, []);
  t.mock.timers.tick(1000); assert.deepEqual(revoked, ['blob:report']);
});
