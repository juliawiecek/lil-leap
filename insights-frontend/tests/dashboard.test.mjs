import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { App } = await import('../src/app/app.ts');

test('navigation clears stale selections, search, notices, and the mobile menu', t => {
  const app = component(t, App);
  app.openClient(app.availableClients()[0]); app.openTrade(app.rows()[0]);
  app.query.set('old search'); app.notice.set('old notice');
  app.mobileNav.set(true); app.detailTab.set('Orders'); app.navigate('Reports');
  assert.equal(app.page(), 'Reports');
  assert.equal(app.selectedClient(), null); assert.equal(app.selectedTrade(), null);
  assert.equal(app.query(), ''); assert.equal(app.notice(), '');
  assert.equal(app.mobileNav(), false); assert.equal(app.detailTab(), 'Overview');
});

test('invalid dates clear dashboard results and prevent report downloads', t => {
  const app = component(t, App);
  const download = t.mock.method(app, 'download', () => {});
  for (const start of ['', '2026-10-01']) {
    app.start.set(start);
    assert.match(app.dateError(), /valid start and end date/);
    assert.deepEqual(app.rows(), []); assert.deepEqual(app.availableClients(), []);
    assert.equal(app.totals().volume, 0);
    assert.doesNotMatch(app.donut(), /NaN|Infinity/);
    app.exportReport();
    assert.equal(app.notice(), app.dateError());
  }
  assert.deepEqual(app.exports(), []);
  assert.equal(download.mock.callCount(), 0);
});

test('asset and market filters update totals, chart, rankings, and status counts together', t => {
  const app = component(t, App);
  app.asset.set('Equities'); app.market.set('US');
  assert.ok(app.rows().length > 0);
  assert.ok(app.rows().every(row => row.asset === 'Equities' && row.market === 'US'));
  assert.ok(app.ranked().every(row => row.asset === 'Equities'));
  const total = app.totals().volume;
  assert.ok(Math.abs(app.mix().reduce((sum, item) => sum + item.value, 0) - total) < .001);
  assert.equal(app.statuses().reduce((sum, item) => sum + item.count, 0), app.rows().length);
  for (const cadence of ['Daily', 'Weekly', 'Monthly', 'Yearly']) {
    app.cadence.set(cadence);
    assert.ok(Math.abs(app.trend().reduce((sum, point) => sum + point.value, 0) - total) < .001);
  }
});

test('investigation search intersects status and supports order and client identifiers', t => {
  const app = component(t, App);
  const target = app.rows().find(row => row.status === 'Filled');
  assert.ok(target);
  app.status.set('Filled'); app.query.set(` ${target.id.toLowerCase()} `);
  assert.deepEqual(app.investigation(), [target]);
  app.query.set(target.clientId.toLowerCase());
  assert.ok(app.investigation().length > 0);
  assert.ok(app.investigation().every(row => row.clientId === target.clientId && row.status === 'Filled'));
  app.query.set('no-such-order'); assert.deepEqual(app.investigation(), []);
});

test('client selection scopes orders and segment activity totals reconcile', t => {
  const app = component(t, App);
  const target = app.availableClients().find(c => app.rows().some(row => row.clientId === c.id));
  assert.ok(target);
  app.openClient(target);
  assert.equal(app.page(), 'Clients');
  assert.ok(app.clientOrders().length > 0);
  assert.ok(app.clientOrders().every(row => row.clientId === target.id));
  for (const segment of app.segmentRows()) {
    assert.equal(segment.active + segment.occasional + segment.dormant, segment.total);
  }
  app.query.set(` ${target.id.toLowerCase()} `);
  assert.deepEqual(app.clientRows(), [target]);
});

test('search destination follows role and returning to Analyst exits investigation', t => {
  const app = component(t, App);
  app.search(); assert.equal(app.page(), 'Clients');
  app.useRole('Operations'); app.search(); assert.equal(app.page(), 'Trade Investigation');
  app.openTrade(app.rows()[0]); app.useRole('Analyst');
  assert.equal(app.page(), 'Overview'); assert.equal(app.selectedTrade(), null);
});

test('reset restores the default data after restrictive filters and search', t => {
  const app = component(t, App);
  const original = app.rows();
  app.start.set('2027-01-01'); app.asset.set('Crypto'); app.market.set('US');
  app.segment.set('Under $10K'); app.status.set('Rejected'); app.query.set('missing');
  app.selectedTrade.set(original[0]);
  assert.deepEqual(app.rows(), []);
  app.reset();
  assert.deepEqual(app.rows(), original);
  assert.equal(app.query(), ''); assert.equal(app.status(), 'All');
  assert.equal(app.selectedTrade(), null);
});

for (const name of ['Trading Activity Report', 'Client Activity Summary', 'Monthly Executive Report']) {
  test(`${name} exports filtered content and retains the downloadable report`, t => {
    const app = component(t, App);
    const download = t.mock.method(app, 'download', () => {});
    app.asset.set('Equities'); app.market.set('US');
    app.exportReport(name);
    const report = app.exports()[0];
    assert.equal(report.name, name);
    assert.match(report.csv, /2026-09-01.*2026-09-22/);
    assert.match(report.csv, /Equities.*US/);
    assert.equal(download.mock.callCount(), 1);
    assert.equal(download.mock.calls[0].arguments[0], report);
    if (name === 'Trading Activity Report') {
      assert.equal(report.rows, app.rows().length);
      assert.match(report.csv, /Order ID/);
      assert.ok(report.csv.includes(app.rows()[0].id));
      assert.doesNotMatch(report.csv, /"Crypto"|"FX"/);
    } else if (name === 'Client Activity Summary') {
      assert.equal(report.rows, app.clientRows().length);
      assert.match(report.csv, /Portfolio segment/);
      assert.ok(report.csv.includes(app.clientRows()[0].name));
    } else {
      assert.equal(report.rows, 5);
      assert.ok(report.csv.includes(String(app.totals().volume)));
      assert.match(report.csv, /Filled notional USD/);
    }
  });
}
