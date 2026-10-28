import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, render } from './dom-helper.mjs';
const { DateField } = await import('../src/app/date-field.ts');

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = isoOf(new Date());
const trigger = (fixture) => fixture.nativeElement.querySelector('.date-trigger');
const calendar = (fixture) => fixture.nativeElement.querySelector('.calendar');
const day = (fixture, iso) => fixture.nativeElement.querySelector(`.day[data-day="${iso}"]`);
const keyOn = (fixture, target, key) => {
  const event = new browser.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  fixture.detectChanges();
  return event;
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('the closed field shows the chosen date in words, or a placeholder, and names itself for screen readers', async (t) => {
  const fixture = await render(t, DateField, { value: '2026-10-27', label: 'From', triggerId: 'activity-from' });
  const button = trigger(fixture);
  assert.equal(button.textContent.trim(), 'Oct 27, 2026');
  assert.equal(button.id, 'activity-from');
  assert.equal(button.getAttribute('aria-label'), 'From: Oct 27, 2026');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(calendar(fixture), null);

  fixture.componentRef.setInput('value', '');
  fixture.detectChanges();
  assert.equal(button.textContent.trim(), 'Any date');
  assert.equal(button.getAttribute('aria-label'), 'From: any date');
  assert.ok(button.querySelector('.placeholder'), 'the placeholder is styled apart from a real date');
});

test('opening shows the chosen month with the chosen day selected, today ringed, and six full weeks', async (t) => {
  const fixture = await render(t, DateField, { value: '2026-10-27', label: 'To' });
  trigger(fixture).click();
  fixture.detectChanges();
  const card = calendar(fixture);
  assert.ok(card, 'the calendar opens below the field');
  assert.equal(card.getAttribute('aria-label'), 'To calendar');
  assert.equal(trigger(fixture).getAttribute('aria-expanded'), 'true');
  assert.match(card.querySelector('.calendar-head b').textContent, /October 2026/);
  assert.equal(card.querySelectorAll('.day').length, 42);
  assert.equal(card.querySelectorAll('.weekday').length, 7);
  // October 2026 starts on a Thursday, so the grid starts on Sunday 27 September.
  const first = card.querySelector('.day');
  assert.equal(first.dataset.day, '2026-09-27');
  assert.ok(first.classList.contains('outside'));
  const chosen = day(fixture, '2026-10-27');
  assert.ok(chosen.classList.contains('selected'));
  assert.equal(chosen.getAttribute('aria-selected'), 'true');
  assert.equal(chosen.tabIndex, 0, 'keyboard focus starts on the chosen day');
  assert.equal(chosen.getAttribute('aria-label'), 'Tuesday, October 27, 2026');
  assert.ok(day(fixture, todayIso)?.classList.contains('today') || !day(fixture, todayIso), 'today is ringed when it is on show');
  trigger(fixture).click();
  fixture.detectChanges();
  assert.equal(calendar(fixture), null, 'the trigger toggles the calendar closed again');
});

test('with no value the calendar opens on the current month with focus on today', async (t) => {
  const fixture = await render(t, DateField, { value: '' });
  const component = fixture.componentInstance;
  component.show();
  fixture.detectChanges();
  const now = new Date();
  assert.deepEqual(component.view(), { year: now.getFullYear(), month: now.getMonth() });
  assert.equal(component.focusIso(), todayIso);
  assert.ok(day(fixture, todayIso).classList.contains('today'));
  await tick();
  assert.equal(fixture.nativeElement.ownerDocument.activeElement?.dataset.day, todayIso, 'today takes focus once drawn');
});

test('the arrows move month by month, across year ends', async (t) => {
  const fixture = await render(t, DateField, { value: '2026-12-15' });
  trigger(fixture).click();
  fixture.detectChanges();
  const nav = (label) => fixture.nativeElement.querySelector(`.nav[aria-label="${label}"]`);
  nav('Next month').click();
  fixture.detectChanges();
  assert.match(calendar(fixture).querySelector('b').textContent, /January 2027/);
  nav('Previous month').click();
  nav('Previous month').click();
  fixture.detectChanges();
  assert.match(calendar(fixture).querySelector('b').textContent, /November 2026/);
  assert.equal(fixture.componentInstance.focusIso(), '2026-12-15', 'paging the view does not move the focused day');
});

test('clicking a day, Clear and Today each emit a value and close the calendar, returning focus to the field', async (t) => {
  const fixture = await render(t, DateField, { value: '2026-10-27' });
  const emitted = [];
  fixture.componentInstance.valueChange.subscribe((value) => emitted.push(value));

  trigger(fixture).click();
  fixture.detectChanges();
  day(fixture, '2026-10-05').click();
  fixture.detectChanges();
  assert.deepEqual(emitted, ['2026-10-05']);
  assert.equal(calendar(fixture), null);
  await tick();
  assert.equal(fixture.nativeElement.ownerDocument.activeElement, trigger(fixture));

  trigger(fixture).click();
  fixture.detectChanges();
  [...fixture.nativeElement.querySelectorAll('.calendar-foot button')].find((b) => b.textContent === 'Clear').click();
  fixture.detectChanges();
  assert.deepEqual(emitted, ['2026-10-05', '']);

  trigger(fixture).click();
  fixture.detectChanges();
  [...fixture.nativeElement.querySelectorAll('.calendar-foot button')].find((b) => b.textContent === 'Today').click();
  fixture.detectChanges();
  assert.deepEqual(emitted, ['2026-10-05', '', todayIso]);
  assert.equal(calendar(fixture), null);
});

test('arrow keys move the focused day, PageUp and PageDown the month, Enter picks and Escape closes', async (t) => {
  const fixture = await render(t, DateField, { value: '2026-10-27' });
  const component = fixture.componentInstance;
  const emitted = [];
  component.valueChange.subscribe((value) => emitted.push(value));
  trigger(fixture).click();
  fixture.detectChanges();

  const moves = [['ArrowRight', '2026-10-28'], ['ArrowLeft', '2026-10-27'], ['ArrowDown', '2026-11-03'], ['ArrowUp', '2026-10-27'], ['PageDown', '2026-11-27'], ['PageUp', '2026-10-27']];
  for (const [key, expected] of moves) {
    const event = keyOn(fixture, day(fixture, component.focusIso()), key);
    assert.equal(component.focusIso(), expected, `${key} lands on ${expected}`);
    assert.ok(event.defaultPrevented, `${key} does not scroll the page`);
    assert.equal(day(fixture, expected).tabIndex, 0);
  }
  // Moving into another month turns the view to it.
  keyOn(fixture, day(fixture, '2026-10-27'), 'ArrowDown');
  assert.equal(component.focusIso(), '2026-11-03');
  assert.match(calendar(fixture).querySelector('b').textContent, /November 2026/);
  await tick();
  assert.equal(fixture.nativeElement.ownerDocument.activeElement?.dataset.day, '2026-11-03');

  // Keys that are not navigation, or that come from the month arrows rather than a day, change nothing.
  const other = keyOn(fixture, day(fixture, '2026-11-03'), 'a');
  assert.equal(other.defaultPrevented, false);
  const fromArrow = keyOn(fixture, fixture.nativeElement.querySelector('.nav'), 'ArrowRight');
  assert.equal(fromArrow.defaultPrevented, false);
  assert.equal(component.focusIso(), '2026-11-03');

  // Enter on a day is the button's own click, which picks that day.
  day(fixture, '2026-11-03').click();
  fixture.detectChanges();
  assert.deepEqual(emitted, ['2026-11-03']);
  assert.equal(calendar(fixture), null);

  trigger(fixture).click();
  fixture.detectChanges();
  const escape = keyOn(fixture, day(fixture, component.focusIso()), 'Escape');
  assert.ok(escape.defaultPrevented);
  assert.equal(calendar(fixture), null, 'Escape closes without choosing');
  assert.deepEqual(emitted, ['2026-11-03']);
  await tick();
  assert.equal(fixture.nativeElement.ownerDocument.activeElement, trigger(fixture));
});

test('Arrow Down on the closed field opens it, and a click elsewhere on the page closes it', async (t) => {
  const fixture = await render(t, DateField, { value: '2026-10-27' });
  const event = keyOn(fixture, trigger(fixture), 'ArrowDown');
  assert.ok(event.defaultPrevented);
  assert.ok(calendar(fixture), 'Arrow Down opens the calendar');

  // A press inside the field leaves it open; one outside closes it.
  fixture.componentInstance.outside({ target: day(fixture, '2026-10-27') });
  fixture.detectChanges();
  assert.ok(calendar(fixture));
  fixture.componentInstance.outside({ target: fixture.nativeElement.ownerDocument.body });
  fixture.detectChanges();
  assert.equal(calendar(fixture), null);
  // Closed already: a stray press does nothing.
  fixture.componentInstance.outside({ target: fixture.nativeElement.ownerDocument.body });
  assert.equal(fixture.componentInstance.open(), false);
});
