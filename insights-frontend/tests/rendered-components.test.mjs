import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, button, browser } from './dom-helper.mjs';
const { DashboardIcon } = await import('../src/app/dashboard-icon.ts');
const { InsightsChart } = await import('../src/app/insights-chart.ts');
const { App } = await import('../src/app/app.ts');

test('insights icons bind known names and fall back for unknown names', async t => {
  const fixture = await render(t, DashboardIcon, { name: 'users' });
  const path = fixture.nativeElement.querySelector('path');
  assert.equal(path.getAttribute('d'), fixture.componentInstance.paths.users);
  fixture.componentRef.setInput('name', 'missing'); fixture.detectChanges();
  assert.equal(path.getAttribute('d'), fixture.componentInstance.paths.arrow);
  assert.equal(fixture.nativeElement.querySelector('svg').getAttribute('aria-hidden'), 'true');
});

test('chart renders empty state, binds points, and exposes values on keyboard focus and hover', async t => {
  const fixture = await render(t, InsightsChart);
  assert.match(fixture.nativeElement.textContent, /No observations/);
  fixture.componentRef.setInput('points', [{ label: '2026-09-01', value: 1234 }, { label: '2026-09-02', value: 2500 }]);
  fixture.componentRef.setInput('label', 'Filtered volume'); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('svg').getAttribute('aria-label'), 'Filtered volume');
  const points = fixture.nativeElement.querySelectorAll('circle[tabindex]'); assert.equal(points.length, 2);
  points[0].dispatchEvent(new Event('focus')); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.chart-readout').textContent, /2026-09-01.*1,234/);
  points[0].dispatchEvent(new Event('blur')); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.chart-readout').textContent, /Hover or focus/);
  points[1].dispatchEvent(new Event('mouseenter')); fixture.detectChanges();
  assert.match(fixture.nativeElement.querySelector('.chart-readout').textContent, /2,500/);
  points[1].dispatchEvent(new Event('mouseleave')); fixture.detectChanges();
  assert.equal(fixture.componentInstance.active(), null);
});

test('dashboard navigation renders pages and their corresponding controls', async t => {
  const fixture = await render(t, App);
  for (const page of ['Trading Activity', 'Client Activity', 'Clients', 'Reports', 'Compliance', 'Settings', 'Overview']) {
    button(fixture, page);
    assert.equal(fixture.componentInstance.page(), page);
    assert.ok(fixture.nativeElement.textContent.includes(fixture.componentInstance.subtitle()));
  }
});

test('report download creates a CSV blob, clicks its filename, and revokes the URL', async t => {
  const fixture = await render(t, App);
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
