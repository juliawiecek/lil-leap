import { test, expect } from '@playwright/test';
import { advancedDesk, account2 } from './advanced-dashboard-fixture.mjs';
import { uuid } from './fixtures.mjs';

test.beforeEach(async ({}, info) => test.skip(info.project.metadata.role !== 'TRADER'));

test('ticket buttons: side, symbol, order type, all sizing shortcuts and protection', async ({ page }, info) => {
  const { ticket, state } = await advancedDesk(page, info);
  for (const [percent, shares] of [[25,12],[50,24],[75,36],[100,48]]) {
    await ticket.getByRole('button', { name: `${percent}%`, exact: true }).click();
    await expect(ticket.locator('#pro-quantity')).toHaveValue(String(shares));
  }
  await ticket.getByRole('button', { name: 'Sell', exact: true }).click();
  for (const [percent, shares] of [[25,5],[50,10],[75,15],[100,20]]) {
    await ticket.getByRole('button', { name: `${percent}%`, exact: true }).click();
    await expect(ticket.locator('#pro-quantity')).toHaveValue(String(shares));
  }
  await ticket.getByRole('button', { name: 'Buy', exact: true }).click();
  await ticket.getByRole('button', { name: 'Limit', exact: true }).click();
  await expect(ticket.locator('#pro-limit')).toHaveValue('101.00');
  await ticket.getByRole('button', { name: 'Market', exact: true }).click();
  await expect(ticket.locator('#pro-limit')).toHaveCount(0);
  await ticket.getByRole('button', { name: 'Change for this order' }).click();
  await ticket.locator('.tolerance-field input').fill('1.5'); await ticket.locator('.tolerance-field input').press('Tab');
  await expect(ticket.locator('.protection-copy')).toContainText('1.5%');
  await ticket.locator('#pro-symbol').selectOption('MSFT');
  await expect(page.locator('.chart-company')).toContainText('MSFT');
  await expect(ticket.locator('.quote-strip')).toContainText('$201.00');
  expect(state.posts).toHaveLength(0); expect(state.errors).toEqual([]);
});

for (const side of ['Buy', 'Sell']) {
  test(`${side} limit with exits: toggle, convert, review, edit, close and confirm correct payload`, async ({ page }, info) => {
    const { ticket, dialog, state } = await advancedDesk(page, info);
    await ticket.getByRole('button', { name: side, exact: true }).click();
    await ticket.getByRole('button', { name: 'Limit', exact: true }).click();
    await ticket.locator('#pro-limit').fill('100'); await ticket.locator('#pro-quantity').fill('2');
    await ticket.getByRole('button', { name: 'Take profit Off', exact: true }).click();
    await ticket.locator('#pro-profit').fill(side === 'Buy' ? '110' : '90');
    await ticket.getByRole('button', { name: 'Stop loss Off', exact: true }).click();
    await ticket.locator('#pro-stop').fill(side === 'Buy' ? '95' : '105');
    await ticket.locator('#pro-exit-unit').selectOption('percent');
    await expect(ticket.locator('#pro-profit')).toHaveValue('10.00');
    await expect(ticket.locator('#pro-stop')).toHaveValue('5.00');
    await ticket.locator('#pro-exit-unit').selectOption('price');
    await ticket.getByRole('button', { name: 'Review Order', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${side} / Limit`);
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click(); await expect(dialog).not.toBeVisible();
    await ticket.getByRole('button', { name: 'Review Order', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close dialog' }).click(); await expect(dialog).not.toBeVisible();
    await ticket.getByRole('button', { name: 'Review Order', exact: true }).click();
    await dialog.getByRole('button', { name: `Confirm ${side}` }).click();
    await expect.poll(() => state.posts.length).toBe(1);
    expect(state.posts[0]).toMatchObject({ side: side.toUpperCase(), quantity: 2, orderType: 'LIMIT', limitPrice: 100,
      takeProfitPrice: side === 'Buy' ? 110 : 90, stopLossPrice: side === 'Buy' ? 95 : 105 });
    await expect(dialog).not.toBeVisible(); expect(state.errors).toEqual([]);
  });
}

test('risk sizing disabled reasons recover and exit toggles remove hidden fields', async ({ page }, info) => {
  const { ticket, state } = await advancedDesk(page, info);
  await ticket.locator('summary', { hasText: 'Risk-based sizing' }).click();
  const apply = ticket.getByRole('button', { name: 'Apply share quantity' });
  await expect(apply).toBeDisabled(); await expect(ticket.locator('#pro-sizing-help')).toContainText('Turn on Stop loss');
  await ticket.getByRole('button', { name: 'Stop loss Off' }).click();
  await ticket.locator('#pro-stop').fill('105'); await expect(ticket.locator('#pro-sizing-help')).toContainText('below');
  await ticket.locator('#pro-stop').fill('96'); await ticket.locator('#pro-risk-budget').fill('2');
  await expect(ticket.locator('#pro-sizing-help')).toContainText('one share');
  await ticket.locator('#pro-risk-budget').fill('100'); await expect(apply).toBeEnabled(); await apply.click();
  await expect(ticket.locator('#pro-quantity')).toHaveValue('20');
  await ticket.getByRole('button', { name: 'Stop loss On' }).click(); await expect(ticket.locator('#pro-stop')).toHaveCount(0);
  await expect(apply).toBeDisabled();
  await ticket.getByRole('button', { name: 'Take profit Off' }).click();
  await ticket.getByRole('button', { name: 'Take profit On' }).click(); await expect(ticket.locator('#pro-profit')).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('presets save, replace, apply, delete and isolate accounts', async ({ page }, info) => {
  const { ticket, state } = await advancedDesk(page, info);
  await ticket.locator('summary', { hasText: 'Saved order presets' }).click();
  await expect(ticket.getByRole('button', { name: 'Save current settings' })).toBeDisabled();
  await ticket.locator('#pro-preset-name').fill('Daily');
  await ticket.getByRole('button', { name: 'Save current settings' }).click();
  await ticket.locator('#pro-quantity').fill('3');
  await ticket.getByRole('button', { name: 'Save current settings' }).click();
  await expect(ticket.locator('.preset-row')).toHaveCount(1);
  await ticket.locator('#pro-quantity').fill('7'); await ticket.locator('.preset-apply').click();
  await expect(ticket.locator('#pro-quantity')).toHaveValue('3');
  await page.locator('.switcher-trigger').click(); await page.locator('.account-row', { hasText: 'Savings' }).click();
  await expect(ticket.locator('.preset-row')).toHaveCount(0);
  await page.locator('.switcher-trigger').click(); await page.locator('.account-row', { hasText: 'Trading' }).click();
  await expect(ticket.locator('.preset-row')).toHaveCount(1);
  await ticket.getByRole('button', { name: 'Remove preset Daily' }).click(); await expect(ticket.locator('.preset-row')).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});

test('an unused invalid risk budget does not block a manually sized order', async ({ page }, info) => {
  const { ticket, dialog } = await advancedDesk(page, info);
  await ticket.locator('summary', { hasText: 'Risk-based sizing' }).click();
  await ticket.locator('#pro-risk-budget').fill('0');
  await expect(ticket.getByRole('button', { name: 'Apply share quantity' })).toBeDisabled();
  await ticket.getByRole('button', { name: 'Review Order', exact: true }).click();
  await expect(dialog).toBeVisible();
});

test('submission failure is visible in review and a retry succeeds', async ({ page }, info) => {
  const { ticket, dialog, state } = await advancedDesk(page, info, { rejectSubmit: true });
  await ticket.getByRole('button', { name: 'Review Order', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm Buy' }).click();
  await expect(dialog).toContainText('Test rejection: insufficient cash.');
  state.rejectSubmit = false;
  await dialog.getByRole('button', { name: 'Confirm Buy' }).click();
  await expect.poll(() => state.posts.length).toBe(2); await expect(dialog).not.toBeVisible();
  expect(state.posts[0].clientReference).toBe(state.posts[1].clientReference);
});

test('order cancellation Keep and Yes cancel; activity filters and dates', async ({ page }, info) => {
  const { ticket, dialog, nav, state } = await advancedDesk(page, info);
  await ticket.getByRole('button', { name: 'Review Order', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm Buy' }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'View all activity' }).click(); await expect(page).toHaveURL(/activity/);
  const activity = page.locator('app-activity-feed');
  await activity.getByRole('button', { name: 'Orders', exact: true }).click();
  await activity.getByRole('button', { name: 'Cancel', exact: true }).click();
  await activity.getByRole('button', { name: 'Keep', exact: true }).click();
  expect(state.orders[0].status).toBe('PENDING');
  await activity.getByRole('button', { name: 'Cancel', exact: true }).click();
  await activity.getByRole('button', { name: 'Yes, cancel', exact: true }).click();
  await expect(activity.locator('.status')).toHaveText('Cancelled');
  await activity.getByRole('button', { name: 'Cash', exact: true }).click();
  await activity.getByRole('button', { name: 'All', exact: true }).click();
  await activity.getByLabel('From', { exact: true }).fill('2026-01-01');
  await activity.getByLabel('To', { exact: true }).fill('2026-12-31');
  await activity.getByRole('button', { name: 'Clear filters' }).click();
  await expect(activity.getByLabel('From', { exact: true })).toHaveValue('');
  await nav.getByRole('button', { name: 'Overview', exact: true }).click();
});

test('navigation, search, notifications, balances, chart periods and dialog controls', async ({ page }, info) => {
  const { nav, dialog, state } = await advancedDesk(page, info);
  await page.getByRole('button', { name: 'Notifications', exact: true }).click(); await expect(page.locator('.notification-popover')).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click(); await expect(page.locator('.notification-popover')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide balances' }).click(); await expect(page.getByRole('button', { name: 'Show balances' })).toBeVisible();
  await page.getByRole('button', { name: 'Show balances' }).click();
  await page.getByRole('separator', { name: 'Resize sidebar' }).press('Home'); await expect(page.locator('.pro-shell')).toHaveClass(/collapsed/);
  await page.getByRole('separator', { name: 'Resize sidebar' }).press('End'); await expect(page.locator('.pro-shell')).not.toHaveClass(/collapsed/);
  for (const period of ['1W','1M','3M','1Y','All','1D']) {
    const control = page.locator('.chart-periods').getByRole('button', { name: period, exact: true }); await control.click(); await expect(control).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click(); await expect(dialog).toContainText('Keyboard Shortcuts');
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'View details', exact: true }).click(); await expect(dialog).toContainText('Portfolio Exposure');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  const search = page.getByRole('textbox', { name: 'Search symbols or companies' });
  await search.fill('Microsoft'); await page.locator('.search-results button').click();
  await expect(page.locator('#pro-symbol')).toHaveValue('MSFT');
  await search.fill('bad-symbol'); await expect(page.locator('.search-results')).toContainText('No matching'); await search.press('Escape');
  for (const name of ['Portfolio','Activity','Markets','Settings','Overview']) { await nav.getByRole('button', { name, exact: true }).click(); await expect(nav.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page'); }
  await page.locator('.pro-logo').click(); await expect(page.locator('app-advanced-ticket')).toBeAttached();
  expect(state.errors).toEqual([]);
});

test('portfolio, watchlists, movers, heatmap and market filter buttons select stocks', async ({ page }, info) => {
  const { nav } = await advancedDesk(page, info);
  for (const tab of ['Balances','Performance','Positions']) { await page.locator('.positions-panel').getByRole('button', { name: tab, exact: true }).click(); await expect(page.locator('.positions-panel .panel-tabs .active')).toHaveText(tab); }
  await page.getByRole('button', { name: 'Trade AAPL', exact: true }).click();
  await page.locator('.positions-table').getByRole('button', { name: 'AAPL', exact: true }).click();
  await page.getByRole('tab', { name: 'Movers', exact: true }).click(); await page.locator('.watch-panel .mover-row').filter({ hasText: 'MSFT' }).click();
  await expect(page.locator('#pro-symbol')).toHaveValue('MSFT');
  await page.getByRole('tab', { name: 'Sectors', exact: true }).click(); await expect(page.locator('.watch-panel .sector-list')).toContainText('Technology');
  await page.getByRole('tab', { name: 'Watchlist', exact: true }).click(); await page.locator('.watch-table button').filter({ hasText: 'AAPL' }).click();
  await page.locator('.heat-tile').filter({ hasText: 'MSFT' }).click(); await expect(page.locator('#pro-symbol')).toHaveValue('MSFT');
  await page.getByRole('button', { name: 'More on Markets' }).click();
  await page.getByLabel('Stock filter').selectOption('Gainers'); await expect(page.locator('.watch-table tbody')).toContainText('AAPL'); await expect(page.locator('.watch-table tbody')).not.toContainText('MSFT');
  await page.getByLabel('Stock filter').selectOption('Decliners'); await expect(page.locator('.watch-table tbody')).toContainText('MSFT');
  await page.getByLabel('Stock filter').selectOption('All stocks');
  await page.locator('.market-tabs').getByRole('button', { name: 'Top Movers', exact: true }).click();
  await page.locator('.market-panel .mover-row').first().click();
  await nav.getByRole('button', { name: 'Markets', exact: true }).click();
  await page.locator('.market-tabs').getByRole('button', { name: 'Sectors', exact: true }).click();
});

test('settings protection choices, custom values, overrides and sidebar controls', async ({ page }, info) => {
  await advancedDesk(page, info);
  await page.getByRole('button', { name: /account settings$/ }).click();
  const settings = page.locator('.settings-panel'), protection = page.locator('app-price-protection-settings');
  for (const choice of ['1%','2%','5%']) { const b = protection.getByRole('button', { name: choice, exact: true }); await b.click(); await expect(b).toHaveAttribute('aria-pressed', 'true'); }
  await protection.getByLabel('Custom percentage').fill('3.5'); await protection.getByLabel('Custom percentage').press('Tab');
  await protection.getByLabel('Override percentage').fill('4'); await protection.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(protection.locator('.chip')).toContainText('AAPL');
  await protection.getByRole('button', { name: 'Remove AAPL override' }).click(); await expect(protection.locator('.chip')).toHaveCount(0);
  await settings.getByLabel('Sidebar width').press('Home'); await expect(page.locator('.pro-shell')).toHaveClass(/collapsed/);
  await settings.getByLabel('Sidebar width').press('End'); await expect(page.locator('.pro-shell')).not.toHaveClass(/collapsed/);
});

test('accounts: switch, add validation/cancel/close/open, transfer max/back/confirm/done', async ({ page }, info) => {
  const { state } = await advancedDesk(page, info);
  const menu = page.locator('#account-menu'), dialog = page.locator('.account-dialog');
  await page.locator('.switcher-trigger').click(); await menu.getByRole('button', { name: /Add account/ }).click();
  await dialog.getByRole('button', { name: 'Open account' }).click(); await expect(dialog).toContainText('Give the account a nickname');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('.switcher-trigger').click(); await menu.getByRole('button', { name: /Add account/ }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.switcher-trigger').click(); await menu.getByRole('button', { name: /Add account/ }).click();
  await dialog.getByLabel('Account nickname').fill('New account'); await dialog.getByRole('button', { name: 'Open account' }).click();
  await expect(dialog).not.toBeVisible(); await expect(page.locator('.switcher-trigger')).toContainText('New account');
  await page.locator('.switcher-trigger').click(); await menu.locator('.account-row', { hasText: 'Trading' }).click();
  await page.locator('.switcher-trigger').click(); await menu.getByRole('button', { name: /Transfer funds/ }).click();
  await dialog.getByRole('button', { name: 'Max', exact: true }).click(); await expect(dialog.locator('#transfer-amount')).toHaveValue('5000.00');
  await dialog.locator('#transfer-from').selectOption(account2); await dialog.locator('#transfer-to').selectOption(uuid);
  await dialog.locator('#transfer-amount').fill('10'); await dialog.getByRole('button', { name: 'Review transfer' }).click();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await dialog.getByRole('button', { name: 'Review transfer' }).click(); await dialog.getByRole('button', { name: 'Confirm transfer' }).click();
  await expect(dialog).toContainText('Moved $10.00'); await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  expect(state.transfers).toHaveLength(1); expect(state.errors).toEqual([]);
});

test('balance retry and market-closed warnings', async ({ page }, info) => {
  const { state, ticket } = await advancedDesk(page, info, { failCash: true, open: false });
  await expect(page.locator('.service-banner')).toBeVisible(); state.failCash = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(page.locator('.service-banner')).toHaveCount(0);
  await expect(ticket.locator('.ticket-warning[role="note"]')).toContainText(/closed/i);
});

for (const action of ['View','Dismiss']) {
  test(`filled order toast ${action} button`, async ({ page }, info) => {
    const { ticket, dialog } = await advancedDesk(page, info, { status: 'FILLED' });
    await ticket.getByRole('button', { name: 'Review Order', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm Buy' }).click(); await expect(dialog).not.toBeVisible();
    const toast = page.locator('app-toasts .toast'); await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: action, exact: true }).click(); await expect(toast).toHaveCount(0);
    if (action === 'View') await expect(page).toHaveURL(/activity/);
  });
}

for (const location of ['sidebar', 'settings']) {
  test(`${location} sign-out button ends test session`, async ({ page }, info) => {
    const { nav } = await advancedDesk(page, info);
    if (location === 'settings') await nav.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator(location === 'sidebar' ? '.sidebar-help' : '.settings-panel').getByRole('button', { name: /Sign out/ }).click();
    await expect(page.locator('#email')).toBeVisible();
  });
}
