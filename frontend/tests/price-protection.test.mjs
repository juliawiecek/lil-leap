import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, input, button } from './dom-helper.mjs';
const {
  PriceProtectionStore, PROTECTION_STORAGE_KEY, parseProtection, protectionLimit, protectionText, validProtection,
} = await import('../src/app/price-protection.ts');
const { PriceProtectionSettings } = await import('../src/app/price-protection-settings.ts');

/** A browser storage stand-in for one test; restores whatever was there before. */
function withStorage(t, initial = {}) {
  const values = new Map(Object.entries(initial));
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  return values;
}

test('only 0.1% to 10% is accepted, rounded to two decimals', () => {
  assert.equal(validProtection(2), 2);
  assert.equal(validProtection('2.345'), 2.35);
  assert.equal(validProtection(0.1), 0.1);
  assert.equal(validProtection(10), 10);
  for (const bad of [0, 0.05, 10.01, -1, 'abc', '', null, undefined, Number.NaN]) {
    assert.equal(validProtection(bad), null, `rejects ${bad}`);
  }
});

test('saved settings are read back; anything corrupt or out of range falls back to the 2% default', () => {
  assert.deepEqual(parseProtection(null), { default: 2, perStock: {} });
  assert.deepEqual(parseProtection('not json'), { default: 2, perStock: {} });
  assert.deepEqual(parseProtection(JSON.stringify({ default: 5, perStock: { AAPL: 3, MSFT: 50, 'bad symbol': 1 } })),
    { default: 5, perStock: { AAPL: 3 } });
  assert.deepEqual(parseProtection(JSON.stringify({ default: 99 })), { default: 2, perStock: {} });
});

test('the ticket says the worst price a buy or sell accepts', () => {
  assert.equal(protectionLimit(227.4, 2, 'Buy'), 231.95);
  assert.equal(protectionLimit(227.4, 2, 'Sell'), 222.85);
  assert.equal(protectionText(227.4, 2, 'Buy'), 'Fills at up to $231.95 (2% above $227.40)');
  assert.equal(protectionText(227.4, 2.5, 'Sell'), 'Fills at no less than $221.72 (2.5% below $227.40)');
});

test('a stock override wins over the default, and changes are saved in the browser', t => {
  const saved = withStorage(t, { [PROTECTION_STORAGE_KEY]: JSON.stringify({ default: 1, perStock: {} }) });
  const store = new PriceProtectionStore();
  assert.equal(store.toleranceFor('AAPL'), 1);
  assert.equal(store.setForStock('AAPL', 3), true);
  assert.equal(store.toleranceFor('AAPL'), 3);
  assert.equal(store.toleranceFor('MSFT'), 1);
  assert.equal(store.setDefault(11), false, 'out of range changes nothing');
  assert.equal(store.setDefault(5), true);
  assert.deepEqual(JSON.parse(saved.get(PROTECTION_STORAGE_KEY)), { default: 5, perStock: { AAPL: 3 } });
  store.setForStock('AAPL', null);
  assert.equal(store.toleranceFor('AAPL'), 5);
  assert.equal(new PriceProtectionStore().toleranceFor('NVDA'), 5, 'a new page reads the saved default');
});

test('without browser storage the settings still apply for the visit', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get() { throw new Error('blocked'); },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  const store = new PriceProtectionStore();
  assert.equal(store.toleranceFor('AAPL'), 2);
  assert.equal(store.setDefault(1), true);
  assert.equal(store.toleranceFor('AAPL'), 1);
});

test('settings set the default with a quick choice or a custom value, and manage per-stock overrides', async t => {
  withStorage(t);
  const fixture = await render(t, PriceProtectionSettings, { symbols: ['AAPL', 'MSFT'] });
  const settings = fixture.componentInstance;
  assert.equal(button(fixture, '2%').getAttribute('aria-pressed'), 'true');
  button(fixture, '5%');
  assert.equal(settings.store.settings().default, 5);

  input(fixture, '.custom input', '0.5', 'change');
  assert.equal(settings.store.settings().default, 0.5);
  assert.equal(settings.custom(), 0.5);
  input(fixture, '.custom input', '25', 'change');
  assert.match(fixture.nativeElement.textContent, /Choose a value from 0\.1% to 10%/);
  assert.equal(settings.store.settings().default, 0.5);

  fixture.nativeElement.querySelector('select').value = 'MSFT';
  input(fixture, 'input[aria-label="Override percentage"]', '3');
  button(fixture, 'Add');
  assert.deepEqual(settings.overrides(), [{ symbol: 'MSFT', percent: 3 }]);
  assert.match(fixture.nativeElement.querySelector('.chip').textContent, /MSFT\s*3%/);
  fixture.nativeElement.querySelector('[aria-label="Remove MSFT override"]').click();
  fixture.detectChanges();
  assert.deepEqual(settings.overrides(), []);
});
