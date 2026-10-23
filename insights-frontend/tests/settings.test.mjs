import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';

const { SettingsPage } = await import('../src/app/pages/settings/settings-page.ts');
const { SiteAccessibility } = await import('../src/app/site-accessibility.ts');

test('Settings renders its page heading and labelled accessibility controls update the preferences', async t => {
  const fixture = await render(t, SettingsPage);
  const host = fixture.nativeElement;

  assert.equal(host.querySelectorAll('h1').length, 1);
  assert.equal(host.querySelector('h1').textContent.trim(), 'Settings');
  assert.equal(host.querySelector('.eyebrow').textContent.trim(), 'NEXTTRADE / SETTINGS');
  assert.equal(host.querySelector('.subtitle').textContent.trim(),
    'Personalize your accessibility preferences for this browser.');

  const section = host.querySelector('section[aria-labelledby]');
  assert.equal(host.querySelector('#' + section.getAttribute('aria-labelledby')).textContent.trim(), 'Accessibility');
  const focusLabel = [...section.querySelectorAll('label')]
    .find(label => label.textContent.trim() === 'Enhanced focus highlighting');
  const focus = focusLabel.querySelector('input[type="checkbox"]');
  const access = fixture.debugElement.injector.get(SiteAccessibility);

  assert.equal(focus.checked, access.settings().enhancedFocus);
  const previous = focus.checked;
  focus.click();
  fixture.detectChanges();
  assert.equal(focus.checked, !previous);
  assert.equal(access.settings().enhancedFocus, !previous);

  const sizeLabel = [...section.querySelectorAll('label')]
    .find(label => label.textContent.trim() === 'Minimum text size');
  assert.equal(host.querySelector('#' + sizeLabel.htmlFor).tagName, 'SELECT');
});
