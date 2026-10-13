import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, input, browser } from './dom-helper.mjs';
const { InvestorProfile } = await import('../src/app/investor-profile.ts');

test('profile prefills name, formats contact and currency inputs, and builds the address', async t => {
  const fixture = await render(t, InvestorProfile, { fullName: ' Ada Byron Lovelace ', email: 'ada@example.com' });
  const profile = fixture.componentInstance;
  assert.equal(profile.values().first_name, 'Ada'); assert.equal(profile.values().last_name, 'Byron Lovelace');
  assert.equal(document.activeElement.id, 'profile-heading');
  input(fixture, '#profile-phone', '3125550123'); assert.equal(profile.values().phone, '312-555-0123');
  input(fixture, '#profile-phone', '+13125550123'); assert.equal(profile.values().phone, '+1-312-555-0123');
  input(fixture, '#profile-phone', '+442071234567'); assert.equal(profile.values().phone, '+442071234567');
  input(fixture, '#profile-ssn', '123456789'); assert.equal(profile.values().ssn, '123-45-6789');
  input(fixture, '#profile-street_address', ' 123 Main St ');
  input(fixture, '#profile-apartment', 'A12#'); assert.equal(profile.values().apartment, '12#');
  input(fixture, '#profile-city', 'Chicago'); input(fixture, '#profile-state_province', 'Illinois');
  input(fixture, '#profile-postal_code', '60a601'); assert.equal(profile.values().postal_code, '60601');
  assert.equal(profile.values().address, '123 Main St, 12#, Chicago, Illinois, 60601');
  profile.goTo(1); fixture.detectChanges();
  input(fixture, '#profile-annual_income', '123456.789'); assert.equal(profile.values().annual_income, '123,456.78');
  input(fixture, '#profile-liquidity_position', '$10000'); assert.equal(profile.values().liquidity_position, '10,000');
  input(fixture, '#profile-employment_status', 'RETIRED', 'change');
  assert.equal(fixture.nativeElement.querySelector('#profile-employer_name').disabled, true);
});

test('backspacing a phone separator removes the adjacent digit rather than trapping the caret', async t => {
  const fixture = await render(t, InvestorProfile);
  const phone = input(fixture, '#profile-phone', '3125550123');
  phone.value = '312555-0123'; phone.setSelectionRange(3, 3);
  phone.dispatchEvent(new browser.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  assert.equal(fixture.componentInstance.values().phone, '315-550-123');
});

function completePersonal(fixture) {
  for (const [id, value] of Object.entries({ first_name: 'Ada', last_name: 'Lovelace', date_of_birth: '1990-01-01',
    phone: '3125550123', street_address: '123 Main St', city: 'Chicago', state_province: 'Illinois',
    postal_code: '60601', country: 'United States', ssn: '123456789' })) input(fixture, '#profile-' + id, value);
  input(fixture, '#profile-citizenship_status', 'CITIZEN', 'change');
}
function submit(fixture) {
  fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  fixture.detectChanges();
}

test('profile blocks missing or invalid personal information and advances valid answers', async t => {
  const fixture = await render(t, InvestorProfile);
  const profile = fixture.componentInstance;
  // Happy DOM does not inherit disabled fieldsets during constraint validation.
  // Keep native control validation, but restrict it to the enabled form section.
  const form = fixture.nativeElement.querySelector('form');
  t.mock.method(form, 'reportValidity', () => [...form.elements]
    .filter(el => !el.closest('fieldset[disabled]'))
    .every(el => el.checkValidity()));
  submit(fixture); assert.equal(profile.step(), 0);
  completePersonal(fixture);
  input(fixture, '#profile-date_of_birth', '2020-01-01'); submit(fixture);
  assert.equal(profile.step(), 0); assert.match(fixture.nativeElement.querySelector('#profile-date_of_birth').validationMessage, /at least 21/);
  input(fixture, '#profile-date_of_birth', '1990-01-01');
  input(fixture, '#profile-country', 'Atlantis'); submit(fixture);
  assert.equal(profile.step(), 0); assert.match(fixture.nativeElement.querySelector('#profile-country').validationMessage, /country or territory/);
  input(fixture, '#profile-country', 'united states');
  input(fixture, '#profile-phone', '123'); submit(fixture);
  assert.equal(profile.step(), 0); assert.match(fixture.nativeElement.querySelector('#profile-phone').validationMessage, /valid phone number/);
  input(fixture, '#profile-phone', '3125550123');
  input(fixture, '#profile-ssn', '123'); submit(fixture);
  assert.match(fixture.nativeElement.querySelector('#profile-ssn').validationMessage, /9 digits/);
  input(fixture, '#profile-ssn', '123456789'); submit(fixture);
  assert.equal(profile.step(), 1, [...fixture.nativeElement.querySelectorAll('input,select')].filter(el => !el.checkValidity()).map(el => `${el.id}: ${el.validationMessage} (disabled fieldset: ${el.closest('fieldset')?.disabled})`).join('\n'));
  assert.equal(profile.values().country, 'United States');
  assert.equal(document.activeElement.id, 'profile-heading');
});

test('forward deletion removes the digit after a phone separator', async t => {
  const fixture = await render(t, InvestorProfile);
  const phone = input(fixture, '#profile-phone', '3125550123');
  phone.value = '312555-0123'; phone.setSelectionRange(3, 3);
  phone.dispatchEvent(new browser.InputEvent('input', { bubbles: true, inputType: 'deleteContentForward' }));
  assert.equal(fixture.componentInstance.values().phone, '312-550-123');
});

test('deleting an international prefix at the boundaries preserves digits', async t => {
  const fixture = await render(t, InvestorProfile);
  const phone = input(fixture, '#profile-phone', '+442071234567');
  phone.value = '442071234567'; phone.setSelectionRange(0, 0);
  phone.dispatchEvent(new browser.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  assert.equal(fixture.componentInstance.values().phone, '442-071-2345');
  input(fixture, '#profile-phone', '+442071234567');
  phone.value = '442071234567'; phone.setSelectionRange(phone.value.length, phone.value.length);
  phone.dispatchEvent(new browser.InputEvent('input', { bubbles: true, inputType: 'deleteContentForward' }));
  assert.equal(fixture.componentInstance.values().phone, '442-071-2345');
});

test('domestic eleven-digit phones retain the leading country code', async t => {
  const fixture = await render(t, InvestorProfile);
  input(fixture, '#profile-phone', '13125550123');
  assert.equal(fixture.componentInstance.values().phone, '1-312-555-0123');
});

test('validation rejects malformed money and phones with too few digits', async t => {
  const fixture = await render(t, InvestorProfile);
  const profile = fixture.componentInstance;
  const phone = fixture.nativeElement.querySelector('#profile-phone');
  phone.value = '(12) 34';
  submit(fixture);
  assert.match(phone.validationMessage, /at least 7 digits/);
  profile.goTo(1); fixture.detectChanges();
  const salary = fixture.nativeElement.querySelector('#profile-annual_income');
  salary.value = '12.345';
  submit(fixture);
  assert.match(salary.validationMessage, /up to two decimal places/);
});

test('formatting falls back to the end when a control has no caret position', async t => {
  const fixture = await render(t, InvestorProfile);
  const profile = fixture.componentInstance;
  for (const [id, raw, expected] of [
    ['postal_code', '60a601', '60601'], ['phone', '3125550123', '312-555-0123'],
    ['annual_income', '12345.6', '12,345.6'],
  ]) {
    const control = document.createElement('input');
    control.value = raw;
    Object.defineProperty(control, 'selectionStart', { configurable: true, get: () => null });
    control.setSelectionRange = () => {};
    profile.update({ id }, { target: control });
    assert.equal(profile.values()[id], expected);
  }
});

test('currency grouping preserves leading zeros, precision limits and the editing caret', async t => {
  const fixture = await render(t, InvestorProfile);
  const profile = fixture.componentInstance;
  profile.goTo(1); fixture.detectChanges();
  const control = fixture.nativeElement.querySelector('#profile-annual_income');
  for (const [raw, expected] of [
    ['', ''], ['123', '123'], ['1234', '1,234'], ['123456', '123,456'],
    ['000123', '000,123'], ['.5', '.5'], ['1234.', '1,234.'],
    ['12345678901234567.987', '1,234,567,890,123,456.98'],
  ]) {
    control.value = raw;
    control.setSelectionRange(raw.length, raw.length);
    control.dispatchEvent(new browser.InputEvent('input', { bubbles: true }));
    assert.equal(profile.values().annual_income, expected);
    assert.equal(control.selectionStart, expected.length);
    assert.equal(control.selectionEnd, expected.length);
  }
  control.value = '12345.67';
  control.setSelectionRange(3, 3);
  control.dispatchEvent(new browser.InputEvent('input', { bubbles: true }));
  assert.equal(control.value, '12,345.67');
  assert.equal(control.selectionStart, 4);
  assert.equal(control.selectionEnd, 4);
});
