import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { App } = await import('../src/app/app.ts');
const { PageState } = await import('../src/app/page-state.ts');
const { clients, trades } = await import('../src/app/insights-data.ts');
test('URL details resolve the requested record, validate tabs, and clear on list navigation', (t) => {
  let select;
  const app = component(t, App, [
    {
      provide: PageState,
      useValue: {
        connect: (_page, _paths, _fields, callback) => {
          select = callback;
          return {
            go: () => {
              /* Router is covered by browser tests. */
            },
            destroy: () => {
              /* No fixture subscriptions. */
            },
          };
        },
      },
    },
  ]);
  app.detailTab.set('Audit Trail');
  select(['clients', clients[0].id]);
  assert.equal(app.selectedClient().id, clients[0].id);
  assert.equal(app.detailTab(), 'Overview');
  app.detailTab.set('Lifecycle');
  select(['orders', trades[0].id]);
  assert.equal(app.selectedTrade().id, trades[0].id);
  assert.equal(app.selectedClient(), null);
  assert.equal(app.detailTab(), 'Lifecycle');
  select(['clients', 'missing']);
  assert.equal(app.selectedClient(), null);
  assert.match(app.notice(), /unavailable/);
  select(['dashboard']);
  assert.equal(app.selectedTrade(), null);
  assert.equal(app.detailTab(), 'Overview');
});
