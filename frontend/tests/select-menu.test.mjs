import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, render } from './dom-helper.mjs';
const { SelectMenu } = await import('../src/app/select-menu.ts');

const options = [
  { value: 'a', label: 'Alabama' },
  { value: 'b', label: 'Boston' },
  { value: 'c', label: 'California' },
  { value: 'd', label: 'Colorado' },
];
async function setup(t, inputs = {}) {
  const fixture = await render(t, SelectMenu, { triggerId: 'state', options, ...inputs });
  const menu = fixture.componentInstance;
  const button = fixture.nativeElement.querySelector('button');
  const picked = [];
  menu.picked.subscribe(value => picked.push(value));
  const key = value => {
    button.dispatchEvent(new browser.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  return { fixture, menu, button, picked, key };
}

test('dropdown displays its selection and emits a clicked option with accessible state', async t => {
  const { fixture, menu, button, picked } = await setup(t, { value: 'b', labelledBy: 'state-label', describedBy: 'help', invalid: true });
  assert.match(button.textContent, /Boston/);
  assert.equal(button.getAttribute('aria-labelledby'), 'state-label state');
  assert.equal(button.getAttribute('aria-describedby'), 'help');
  assert.equal(button.getAttribute('aria-invalid'), 'true');
  button.click(); fixture.detectChanges();
  assert.equal(menu.index(), 1);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  const rows = fixture.nativeElement.querySelectorAll('[role=option]');
  assert.equal(rows[1].getAttribute('aria-selected'), 'true');
  rows[2].dispatchEvent(new browser.MouseEvent('mouseenter'));
  assert.equal(menu.index(), 2);
  const down = new browser.MouseEvent('mousedown', { cancelable: true });
  rows[2].dispatchEvent(down);
  assert.equal(down.defaultPrevented, true);
  rows[2].click(); fixture.detectChanges();
  assert.deepEqual(picked, ['c']);
  assert.equal(menu.open(), false);
  assert.equal(fixture.nativeElement.querySelector('[role=listbox]'), null);
});

test('dropdown keyboard navigation clamps, jumps by letter, and selects with Enter or Space', async t => {
  const { menu, key, picked } = await setup(t);
  key('x'); assert.equal(menu.open(), false);
  key('ArrowDown'); assert.equal(menu.open(), true);
  key('ArrowDown'); assert.equal(menu.index(), 1);
  key('ArrowUp'); assert.equal(menu.index(), 0);
  key('PageDown'); assert.equal(menu.index(), 3);
  key('PageUp'); assert.equal(menu.index(), 0);
  key('End'); assert.equal(menu.index(), 3);
  key('Home'); assert.equal(menu.index(), 0);
  key('c'); assert.equal(menu.index(), 2);
  key('c'); assert.equal(menu.index(), 3);
  key('c'); assert.equal(menu.index(), 2);
  key('z'); assert.equal(menu.index(), 2);
  key('Enter'); assert.deepEqual(picked, ['c']);
  key('ArrowUp'); key(' '); assert.deepEqual(picked, ['c', 'a']);
  key('ArrowDown'); key('Escape'); assert.equal(menu.open(), false);
  key('ArrowDown'); key('Tab'); assert.equal(menu.open(), false);
  await Promise.resolve();
});

test('dropdown handles empty options, focus leaving, toggling and disabled presentation', async t => {
  const { fixture, menu, button, key, picked } = await setup(t, { options: [] });
  assert.match(button.textContent, /Select an option/);
  button.click(); fixture.detectChanges();
  key('Enter'); assert.deepEqual(picked, []);
  key('z');
  button.click(); fixture.detectChanges(); assert.equal(menu.open(), false);
  button.click(); fixture.detectChanges();
  fixture.nativeElement.querySelector('.menu-picker').dispatchEvent(new browser.FocusEvent('focusout'));
  assert.equal(menu.open(), false);
  fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
  assert.equal(button.disabled, true);
});
