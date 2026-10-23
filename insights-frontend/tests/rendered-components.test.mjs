import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, browser } from './dom-helper.mjs';
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

test('chart resizing refits its real point coordinates and disconnects its observer on teardown', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  const observers = [];
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'ResizeObserver', previous); else delete globalThis.ResizeObserver; });
  const fixture = await render(t, InsightsChart, { points: [{ label: 'Start', value: 1 }, { label: 'End', value: 2 }] });
  const chart = fixture.componentInstance;
  assert.equal(observers.length, 1);
  const observer = observers[0];
  assert.equal(observer.element, fixture.nativeElement);
  observer.callback([{ contentRect: { width: 480.4 } }]); fixture.detectChanges();
  assert.equal(chart.width(), 480);
  assert.equal(chart.x(1), 466);
  assert.equal(fixture.nativeElement.querySelector('svg').getAttribute('viewBox'), '0 0 480 220');
  observer.callback([{ contentRect: { width: 90 } }]); fixture.detectChanges();
  assert.equal(chart.width(), 480, 'a temporarily hidden or narrow chart keeps its last usable width');
  fixture.destroy();
  assert.equal(observer.disconnected, true);
});

test('chart renders empty state, binds points, and exposes values on keyboard focus and hover', async t => {
  const fixture = await render(t, InsightsChart);
  assert.match(fixture.nativeElement.textContent, /No observations/);
  fixture.componentRef.setInput('points', [{ label: '2026-09-01', value: 1234 }, { label: '2026-09-02', value: 2500 }]);
  fixture.componentRef.setInput('label', 'Filtered volume'); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('svg').getAttribute('aria-label'), 'Filtered volume');
  const svg = fixture.nativeElement.querySelector('svg');
  const points = fixture.nativeElement.querySelectorAll('circle[aria-hidden="true"]'); assert.equal(points.length, 2);
  assert.equal(fixture.nativeElement.querySelectorAll('circle[tabindex]').length, 0, 'one chart focus stop avoids descendants hidden by role=img');
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Home' })); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.chart-readout').textContent, /2026-09-01.*1,234/);
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'ArrowRight' })); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.chart-readout').textContent, /2026-09-02.*2,500/);
  svg.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape' })); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.chart-readout').textContent, /arrow keys/);
  points[1].dispatchEvent(new Event('mouseenter')); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.chart-readout').textContent, /2,500/);
  points[1].dispatchEvent(new Event('mouseleave')); fixture.detectChanges();
  assert.equal(fixture.componentInstance.active(), null);
});

const signedInAs = (role, session = { logout: async () => {} }) => [
  provideRouter([]),
  { provide: AuthService, useValue: { userRole: role, email: `${role.toLowerCase()}@nexttrade.local` } },
  { provide: AppSessionService, useValue: session },
];
const navLabels = (fixture) => [...fixture.nativeElement.querySelectorAll('nav a span')].map(span => span.textContent.trim());
const navGroups = (fixture) => [...fixture.nativeElement.querySelectorAll('nav .nav-group')].map(p => p.textContent.trim());

test('analysts see the three reporting pages and their settings, and the header shows who is signed in', async t => {
  const fixture = await render(t, Shell, {}, signedInAs('ANALYST'));
  assert.deepEqual(navLabels(fixture), ['Insights', 'Clients', 'Reports', 'Settings']);
  assert.deepEqual(navGroups(fixture), ['Analytics', 'Preferences']);
  assert.match(fixture.nativeElement.querySelector('.identity').textContent, /analyst@nexttrade\.local.*Analyst/s);
  assert.equal(fixture.nativeElement.querySelector('.avatar').textContent.trim(), 'A');
  assert.equal(fixture.nativeElement.querySelector('header select'), null, 'the role is never chosen in the page');
});

test('operations staff see everything analysts see, plus the trade lookup', async t => {
  const fixture = await render(t, Shell, {}, signedInAs('OPERATIONS'));
  assert.deepEqual(navLabels(fixture), ['Insights', 'Clients', 'Reports', 'Trade lookup', 'Settings']);
  assert.deepEqual(navGroups(fixture), ['Analytics', 'Operations', 'Preferences']);
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

test('a timed chart labels real times and shows each point\'s detail in the readout', async t => {
  const fixture = await render(t, InsightsChart);
  fixture.componentRef.setInput('points', [
    { label: 'Midnight', value: 0, at: 0 },
    { label: '8:30:21 AM CT', value: 1, at: 30_621_000, note: 'Buy 3 MSFT · $1,524.46' },
    { label: 'Now', value: 1, at: 36_000_000 },
  ]);
  fixture.componentRef.setInput('ticks', [{ at: 0, label: '12 AM' }, { at: 18_000_000, label: '5 AM' }, { at: 36_000_000, label: '10 AM' }]);
  fixture.componentRef.setInput('prefix', '');
  fixture.componentRef.setInput('valueLabel', 'Orders so far');
  fixture.detectChanges();
  const labels = [...fixture.nativeElement.querySelectorAll('svg > text')].map((text) => [text.textContent.trim(), text.getAttribute('text-anchor')]);
  assert.deepEqual(labels.slice(-3), [['12 AM', 'start'], ['5 AM', 'middle'], ['10 AM', 'end']]);
  const image = fixture.nativeElement.querySelector('svg[tabindex="0"]');
  assert.ok(image, 'the entire chart is one keyboard stop');
  image.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
  image.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); fixture.detectChanges();
  const readout = fixture.nativeElement.querySelector('.chart-readout');
  assert.equal(readout.querySelector('.note').textContent.trim(), 'Buy 3 MSFT · $1,524.46');
  assert.match(readout.textContent, /8:30:21 AM CT\s*Buy 3 MSFT · \$1,524\.46\s*Orders so far\s*1/);
  assert.match(fixture.componentInstance.description(), /Buy 3 MSFT/);
  assert.equal(fixture.componentInstance.dataTable().rows[1][2], 'Buy 3 MSFT · $1,524.46');
  image.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' })); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('.chart-readout .note'), null, 'a point without a detail shows none');
});
