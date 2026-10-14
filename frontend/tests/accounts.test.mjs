import assert from 'node:assert/strict';
import { test } from 'node:test';
import { of } from 'rxjs';
import { ElementRef } from '@angular/core';
import { component } from './component-helper.mjs';
const { AccountsClient, accountLabel, canTrade, pickAccount } = await import('../src/app/accounts-api.ts');
const { AccountsService, SELECTED_ACCOUNT_KEY } = await import('../src/app/accounts.service.ts');
const { AccountSwitcher } = await import('../src/app/account-switcher.ts');
const { PortfolioClient } = await import('../src/app/portfolio-api.ts');
const { OrderHistoryClient } = await import('../src/app/order-history-api.ts');
const { NoviceDashboard } = await import('../src/app/novice-dashboard.ts');
const { QuoteService } = await import('../src/app/quote.service.ts');

const flush = () => new Promise(resolve => setImmediate(resolve));
const formEvent = { preventDefault: () => undefined };
const account = (id, extra = {}) => ({
  account_id: id, account_number: `NT00000000${id.slice(-4).padStart(4, '0')}`, account_name: `Account ${id}`,
  account_status: 'ACTIVE', trader_level: 'NOVICE', trading_enabled: true, available_cash: 0, ...extra,
});
const brokerage = account('4821', { account_name: 'Individual Brokerage', available_cash: '1000.00' });
const growth = account('7734', { account_name: 'Growth Portfolio', available_cash: 0 });

/** A fake fetch that records each request and answers from a scripted handler. */
function server(handler) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const request = { url, method: init.method ?? 'GET', auth: init.headers?.Authorization, body: init.body && JSON.parse(init.body) };
    requests.push(request);
    const [status, body] = await handler(request);
    return new Response(JSON.stringify(body), { status });
  };
  return { requests, fetchImpl };
}

/** Swaps in an in-memory localStorage for one test. */
function memoryStorage(t, initial = {}) {
  const values = new Map(Object.entries(initial));
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) },
  });
  t.after(() => (original ? Object.defineProperty(globalThis, 'localStorage', original) : delete globalThis.localStorage));
  return values;
}

/** An AccountsService whose client is a scripted fake. */
function accountsWith(t, client) {
  const service = component(t, AccountsService);
  service.client = client;
  return service;
}

test('the accounts client sends the bearer token and the PS-05 request shapes', async () => {
  const { requests, fetchImpl } = server(({ method, url }) => {
    if (method === 'GET') {
      return [200, [brokerage]];
    }
    return url.endsWith('/transfers') ? [200, { amount: 25 }] : [201, { accountId: 'new' }];
  });
  const client = new AccountsClient({ accessToken: 'tok' }, fetchImpl);
  assert.deepEqual(await client.list(), [brokerage]);
  assert.deepEqual(await client.open('  Long-term investing '), { accountId: 'new' });
  assert.deepEqual(await client.transfer('a', 'b', 25), { amount: 25 });
  assert.deepEqual(requests, [
    { url: '/api/v1/accounts', method: 'GET', auth: 'Bearer tok', body: undefined },
    { url: '/api/v1/accounts', method: 'POST', auth: 'Bearer tok', body: { nickname: 'Long-term investing' } },
    { url: '/api/v1/accounts/transfers', method: 'POST', auth: 'Bearer tok', body: { fromAccountId: 'a', toAccountId: 'b', amount: 25 } },
  ]);
});

test('server rejections become fixed, readable messages and a 401 reports the token', async () => {
  const unauthorized = [];
  const tokens = { accessToken: 'tok', unauthorized: (token) => unauthorized.push(token) };
  const answers = [[409, { error: 'INSUFFICIENT_FUNDS', message: 'raw server text' }], [403, { error: 'ACCOUNT_ACCESS_DENIED' }],
    [500, { error: 'SOMETHING_NEW' }], [401, {}]];
  const client = new AccountsClient(tokens, server(() => answers.shift()).fetchImpl);
  await assert.rejects(client.transfer('a', 'b', 5), { message: /more than the available cash/ });
  await assert.rejects(client.transfer('a', 'b', 5), { message: 'You can only move cash between your own accounts.' });
  await assert.rejects(client.list(), { message: 'Something went wrong. Please try again.' });
  await assert.rejects(client.list(), { message: 'Something went wrong. Please try again.' });
  assert.deepEqual(unauthorized, ['tok']);
  await assert.rejects(new AccountsClient({ accessToken: null }, async () => assert.fail('no request')).list(), /Sign in/);
  await assert.rejects(new AccountsClient({ accessToken: 'tok' }, async () => { throw new TypeError('offline'); }).list(),
    /Could not reach the server/);
});

test('the shown account is the last pick while it exists, else the first that can trade', () => {
  const pending = account('0001', { account_status: 'PENDING', trading_enabled: false });
  assert.equal(pickAccount([pending, growth], null), growth);
  assert.equal(pickAccount([pending, growth], pending.account_id), pending);
  assert.equal(pickAccount([pending, growth], 'gone'), growth);
  assert.equal(pickAccount([pending], null), pending);
  assert.equal(pickAccount([], null), null);
  assert.equal(accountLabel(growth), 'Growth Portfolio ••7734');
  assert.equal(canTrade(pending), false);
  assert.equal(canTrade(growth), true);
});

test('switching accounts is remembered in the browser and announced once', t => {
  const stored = memoryStorage(t, { [SELECTED_ACCOUNT_KEY]: growth.account_id });
  const service = accountsWith(t, {});
  let changes = 0;
  const stop = service.onChange(() => changes++);
  service.use([brokerage, growth]);
  assert.equal(service.selected(), growth, 'the remembered account is restored');
  assert.equal(changes, 1);
  service.select(brokerage.account_id);
  service.select(brokerage.account_id);
  assert.equal(service.selected(), brokerage);
  assert.equal(stored.get(SELECTED_ACCOUNT_KEY), brokerage.account_id);
  assert.equal(changes, 2, 'picking the shown account again changes nothing');
  stop();
  service.select(growth.account_id);
  assert.equal(changes, 2);
});

test('blocked browser storage only means the choice is not remembered', t => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
  t.after(() => delete globalThis.localStorage);
  const service = accountsWith(t, {});
  service.use([brokerage, growth]);
  service.select(growth.account_id);
  assert.equal(service.selected(), growth);
});

test('opening an account reloads the list and switches to it; a transfer reloads balances', async t => {
  memoryStorage(t);
  const opened = account('9001', { account_name: 'Long-term investing' });
  let listed = [brokerage];
  const service = accountsWith(t, {
    list: async () => listed,
    open: async () => { listed = [brokerage, opened]; return { accountId: opened.account_id }; },
    transfer: async (from, to, amount) => {
      listed = [{ ...brokerage, available_cash: 1000 - amount }, { ...opened, available_cash: amount }];
      return { fromBalance: 1000 - amount, toBalance: amount };
    },
  });
  await service.refresh();
  let changes = 0;
  service.onChange(() => changes++);
  await service.open('Long-term investing');
  assert.equal(service.selected().account_id, opened.account_id);
  assert.equal(changes, 1);
  await service.transfer(brokerage.account_id, opened.account_id, 250);
  assert.equal(service.selected().available_cash, 250);
  assert.equal(changes, 2);
});

function switcher(t, service) {
  return component(t, AccountSwitcher, [
    { provide: AccountsService, useValue: service },
    { provide: ElementRef, useValue: new ElementRef({ contains: (node) => node === 'inside' }) },
  ]);
}

test('the header picker switches account and closes on an outside click', t => {
  memoryStorage(t);
  const service = accountsWith(t, { list: async () => [brokerage, growth] });
  service.use([brokerage, growth]);
  const picker = switcher(t, service);
  picker.toggleMenu();
  assert.equal(picker.menuOpen(), true);
  picker.closeMenuOutside({ target: 'inside' });
  assert.equal(picker.menuOpen(), true);
  picker.choose(growth);
  assert.equal(service.selected(), growth);
  assert.equal(picker.menuOpen(), false);
  assert.equal(picker.notice(), 'Now showing Growth Portfolio ••7734.');
  picker.toggleMenu();
  picker.closeMenuOutside({ target: 'outside' });
  assert.equal(picker.menuOpen(), false);
  assert.equal(picker.available(brokerage), 1000);
  assert.equal(picker.statusLabel(account('1', { account_status: 'PENDING' })), 'Pending');
  assert.equal(picker.statusLabel(account('2', { trading_enabled: false })), 'Trading off');
  assert.equal(picker.statusLabel(brokerage), '');
});

test('add account checks the nickname before anything is sent, then opens and selects it', async t => {
  memoryStorage(t);
  const sent = [];
  const service = accountsWith(t, {
    list: async () => [brokerage, account('AB12', { account_name: 'Long-term investing' })],
    open: async (nickname) => { sent.push(nickname); return { accountId: 'AB12', accountNumber: 'NT0000000AB12', nickname }; },
  });
  service.use([brokerage]);
  const picker = switcher(t, service);
  picker.openAdd();
  assert.equal(picker.dialog(), 'add');
  for (const [nickname, problem] of [['  ', /Give the account a nickname/], ['x'.repeat(51), /50 characters/], ['<script>', /letters, numbers/]]) {
    picker.nickname.set(nickname);
    await picker.submitAdd(formEvent);
    assert.match(picker.error(), problem);
  }
  assert.deepEqual(sent, []);
  picker.nickname.set(' Long-term investing ');
  await picker.submitAdd();
  assert.deepEqual(sent, ['Long-term investing']);
  assert.equal(picker.dialog(), null);
  assert.equal(service.selected().account_id, 'AB12');
  assert.match(picker.notice(), /Long-term investing ••AB12 is open and selected\. It starts with \$0\.00\./);
});

test('add account shows the server refusal and lets the client try again', async t => {
  memoryStorage(t);
  const service = accountsWith(t, { open: async () => { throw new Error('You already have the maximum of 10 accounts.'); } });
  const picker = switcher(t, service);
  picker.openAdd();
  picker.nickname.set('Eleventh');
  await picker.submitAdd();
  assert.equal(picker.error(), 'You already have the maximum of 10 accounts.');
  assert.equal(picker.dialog(), 'add');
  assert.equal(picker.busy(), false);
});

test('transfer funds validates, reviews, then moves the cash and shows both balances', async t => {
  memoryStorage(t);
  const moved = [];
  const service = accountsWith(t, {
    list: async () => [brokerage, growth],
    transfer: async (from, to, amount) => { moved.push([from, to, amount]); return { amount, fromBalance: 749.75, toBalance: 250.25 }; },
  });
  service.use([brokerage, growth]);
  const picker = switcher(t, service);
  picker.openTransfer();
  assert.deepEqual([picker.fromId(), picker.toId()], [brokerage.account_id, growth.account_id]);
  assert.deepEqual(picker.destinations(), [growth]);
  for (const [amount, problem] of [['', /dollars and cents/], ['0', /dollars and cents/], ['1.234', /dollars and cents/],
    ['abc', /dollars and cents/], ['1000.01', /more than the available cash/]]) {
    picker.amount.set(amount);
    picker.reviewTransfer(formEvent);
    assert.match(picker.error(), problem);
    assert.equal(picker.step(), 'form');
  }
  await picker.confirmTransfer();
  assert.deepEqual(moved, [], 'nothing moves before review');
  assert.equal(picker.transferTitle(), 'Transfer funds');
  picker.amount.set('250.25');
  picker.reviewTransfer();
  assert.equal(picker.step(), 'review');
  assert.equal(picker.transferTitle(), 'Review transfer');
  await picker.confirmTransfer();
  assert.deepEqual(moved, [[brokerage.account_id, growth.account_id, 250.25]]);
  assert.equal(picker.step(), 'done');
  assert.equal(picker.result().toBalance, 250.25);
  picker.closeDialog();
  assert.equal(picker.dialog(), null);
});

test('transfer keeps source and target different and reports a server refusal on review', async t => {
  memoryStorage(t);
  const third = account('5555', { account_name: 'Savings' });
  const service = accountsWith(t, { transfer: async () => { throw new Error('You can only move cash between your own accounts.'); } });
  service.use([brokerage, growth, third]);
  const picker = switcher(t, service);
  picker.openTransfer();
  picker.setFrom(growth.account_id);
  assert.equal(picker.toId(), brokerage.account_id, 'the target moves off the new source');
  picker.setFrom(brokerage.account_id);
  picker.toId.set(brokerage.account_id);
  picker.amount.set('10');
  picker.reviewTransfer();
  assert.equal(picker.error(), 'Choose two different accounts.');
  picker.toId.set(third.account_id);
  picker.reviewTransfer();
  await picker.confirmTransfer();
  assert.equal(picker.error(), 'You can only move cash between your own accounts.');
  assert.equal(picker.step(), 'review');
});

test('a single account cannot transfer, and the dialog closes from its dimmed backdrop', t => {
  memoryStorage(t);
  const service = accountsWith(t, {});
  service.use([brokerage]);
  const picker = switcher(t, service);
  assert.equal(picker.canTransfer(), false);
  assert.equal(picker.atLimit(), false);
  picker.openAdd();
  picker.backdrop({ target: 'somewhere inside the form' });
  assert.equal(picker.dialog(), 'add');
});

test('portfolio and order history requests carry the selected account', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return new Response('[]', { status: 200 }); };
  await new PortfolioClient({ accessToken: 'tok' }, fetchImpl).load('acct 1');
  const token = `x.${Buffer.from(JSON.stringify({ sub: 'user-1' })).toString('base64url')}.y`;
  await new OrderHistoryClient({ accessToken: token }, fetchImpl).list({ status: 'FILLED', accountId: 'acct-2' });
  assert.deepEqual(urls.sort(), [
    '/api/v1/cash?accountId=acct%201',
    '/api/v1/clients/user-1/orders?status=FILLED&accountId=acct-2',
    '/api/v1/holdings?accountId=acct%201',
  ]);
});

test('the dashboard loads the selected account and reloads its balances when another is picked', async t => {
  memoryStorage(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const desk = component(t, NoviceDashboard, [
    { provide: QuoteService, useValue: { getLatestByMarketSymbol: () => of({ midpoint: 100 }) } },
  ]);
  const loads = [];
  desk.portfolioClient = { load: async (accountId) => { loads.push(accountId); return { cash: accountId === growth.account_id ? 5 : 1000, holdings: [] }; } };
  desk.orderSubmissionClient = { getAccounts: async () => [brokerage, growth], getInstruments: async () => [] };
  desk.auth = { traderLevel: 'NOVICE', riskProfile: null };
  await desk.ngOnInit(); await flush();
  assert.deepEqual(loads, [brokerage.account_id], 'the first load is already scoped to one account');
  assert.equal(desk.buyingPower(), 1000);
  desk.accountState.select(growth.account_id); await flush();
  assert.deepEqual(loads, [brokerage.account_id, growth.account_id]);
  assert.equal(desk.buyingPower(), 5);
});

test('trading from an account that is not open yet explains how to switch', async t => {
  memoryStorage(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const desk = component(t, NoviceDashboard, [
    { provide: QuoteService, useValue: { getLatestByMarketSymbol: () => of({ midpoint: 100 }) } },
  ]);
  desk.portfolioClient = { load: async () => ({ cash: 1000, holdings: [] }) };
  desk.orderSubmissionClient = {
    getAccounts: async () => [account('0001', { account_status: 'PENDING', trading_enabled: false })],
    getInstruments: async () => [{ instrumentId: 'aapl', symbol: 'AAPL' }],
    submit: async () => assert.fail('a pending account must not trade'),
  };
  desk.auth = { traderLevel: 'NOVICE', riskProfile: null };
  await desk.ngOnInit(); await flush();
  desk.openTrade('Buy', 'AAPL');
  desk.quantity.set('1');
  desk.reviewing.set(true);
  await desk.confirmTrade();
  assert.match(desk.tradeMessage(), /not open for trading yet/);
});
