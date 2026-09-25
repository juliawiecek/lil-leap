import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, input, button } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
const { DashboardIcon } = await import('../src/app/dashboard-icon.ts');
const { StockDashboard } = await import('../src/app/stock-dashboard.ts');
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');
const { AdvancedTicket } = await import('../src/app/advanced-ticket.ts');
const { AdvancedChart } = await import('../src/app/advanced-chart.ts');

test('icons render requested paths and fall back for unknown names', async t => {
  const fixture = await render(t, DashboardIcon, { name: 'apple' });
  const svg = fixture.nativeElement.querySelector('svg');
  assert.equal(svg.getAttribute('fill'), 'currentColor');
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.querySelector('path').getAttribute('d'), fixture.componentInstance.paths.apple);
  fixture.componentRef.setInput('name', 'unknown'); fixture.detectChanges();
  assert.equal(svg.getAttribute('fill'), 'none');
  assert.equal(svg.querySelector('path').getAttribute('d'), fixture.componentInstance.paths.arrow);
});

test('server tier selects the visible dashboard and child sign-out reaches the parent', async t => {
  const fixture = await render(t, StockDashboard, { name: 'Ada', level: 'NOVICE' });
  const root = fixture.nativeElement;
  assert.equal(root.querySelector('app-novice-dashboard').hidden, false);
  assert.equal(root.querySelector('app-advanced-dashboard').hidden, true);
  fixture.componentRef.setInput('level', 'ADVANCED'); fixture.detectChanges();
  assert.equal(root.querySelector('app-novice-dashboard').hidden, true);
  assert.equal(root.querySelector('app-advanced-dashboard').hidden, false);
  let emitted = 0; fixture.componentInstance.signOut.subscribe(() => emitted++);
  const settings = [...root.querySelectorAll('app-advanced-dashboard button')].find(b => b.textContent.trim() === 'Settings');
  assert.ok(settings); settings.click(); fixture.detectChanges();
  const logout = [...root.querySelectorAll('app-advanced-dashboard button')].find(b => /sign out/i.test(b.textContent + b.getAttribute('title') + b.getAttribute('aria-label')));
  assert.ok(logout); logout.click();
  assert.equal(emitted, 1);
});

test('trade ticket binds order inputs and submits a review with validation', async t => {
  const desk = component(t, AdvancedDashboard);
  const fixture = await render(t, AdvancedTicket, { desk });
  input(fixture, '#pro-symbol', 'TSLA', 'change');
  input(fixture, '#pro-type', 'Market', 'change');
  input(fixture, '#pro-quantity', '2');
  assert.equal(desk.selected().symbol, 'TSLA');
  assert.equal(desk.orderType(), 'Market'); assert.equal(desk.quantity(), '2');
  assert.equal(fixture.nativeElement.querySelector('#pro-limit'), null);
  const review = t.mock.method(desk, 'openModal', () => {});
  fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(review.mock.callCount(), 1); assert.equal(desk.message(), '');
  input(fixture, '#pro-quantity', '0');
  fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  assert.match(desk.message(), /whole number/); assert.equal(review.mock.callCount(), 1);
  button(fixture, 'Alerts');
  assert.match(fixture.nativeElement.textContent, /alert/i);
});

test('chart period buttons update accessible labels and plotted candles', async t => {
  const desk = component(t, AdvancedDashboard);
  const fixture = await render(t, AdvancedChart, { desk });
  assert.ok(fixture.nativeElement.querySelector('svg[aria-label="AAPL 1D candlestick chart"]'));
  const before = desk.candles();
  const weekly = button(fixture, '1W');
  assert.equal(weekly.getAttribute('aria-pressed'), 'true');
  assert.equal(desk.period(), '1W'); assert.notDeepEqual(desk.candles(), before);
  assert.ok(fixture.nativeElement.querySelector('svg[aria-label="AAPL 1W candlestick chart"]'));
  desk.choose(desk.quote('TSLA')); fixture.detectChanges();
  assert.match(fixture.nativeElement.textContent, /Tesla/);
  assert.ok(fixture.nativeElement.querySelector('.loss'));
});
