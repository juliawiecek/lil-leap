import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, render } from './dom-helper.mjs';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
const { APP_NAME, PageTitleStrategy, pageTitle } = await import('../src/app/page-title.ts');
const { MAIN_CONTENT_ID, SkipLink } = await import('../src/app/skip-link.ts');
const { routes } = await import('../src/app/app.routes.ts');
const { PAGE_PATHS } = await import('../src/app/page-state.ts');
const { appConfig } = await import('../src/app/app.config.ts');

test('page titles name the page first, then the app (PS-20)', () => {
  assert.equal(pageTitle('Portfolio'), 'Portfolio · NextTrade');
  assert.equal(pageTitle('  Sign in '), 'Sign in · NextTrade');
  assert.equal(pageTitle(''), APP_NAME);
  assert.equal(pageTitle(undefined), 'NextTrade');
});

test('every route has its own title, and the app uses the page title strategy', () => {
  const titles = Object.fromEntries(routes.filter((route) => route.title).map((route) => [route.path, route.title]));
  for (const [name, path] of Object.entries(PAGE_PATHS)) {
    assert.equal(titles[path.slice(1)], name);
  }
  assert.equal(titles.login, 'Sign in');
  assert.equal(titles['reset-password'], 'Reset password');
  assert.equal(titles['**'], 'Page not found');
  assert.equal(new Set(Object.values(titles)).size, Object.keys(titles).length, 'no two pages share a title');
  assert.equal(appConfig.providers.find((p) => p.provide === TitleStrategy)?.useClass, PageTitleStrategy);
});

test('the tab title follows navigation between pages', async (t) => {
  class Blank {}
  Component({ selector: 'app-blank', template: '' })(Blank);
  await render(t, Blank, {}, [
    provideRouter([
      { path: 'dashboard', title: 'Overview', component: Blank },
      { path: 'settings', title: 'Settings', component: Blank },
      { path: 'untitled', component: Blank },
    ]),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
  ]);
  const router = TestBed.inject(Router);
  const title = TestBed.inject(Title);
  await router.navigateByUrl('/dashboard');
  assert.equal(title.getTitle(), 'Overview · NextTrade');
  await router.navigateByUrl('/settings');
  assert.equal(title.getTitle(), 'Settings · NextTrade');
  await router.navigateByUrl('/untitled');
  assert.equal(title.getTitle(), 'NextTrade');
});

test('the skip link is first, and moves focus to the main content without leaving the page', async (t) => {
  const main = browser.document.createElement('main');
  main.id = MAIN_CONTENT_ID;
  browser.document.body.append(main);
  t.after(() => main.remove());
  const fixture = await render(t, SkipLink);
  const link = fixture.nativeElement.querySelector('a');
  assert.equal(link.textContent.trim(), 'Skip to main content');
  assert.equal(link.getAttribute('href'), '#main-content');
  assert.ok(link.hasAttribute('data-scan-ignore'), 'switch control leaves it out');
  const click = new browser.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true, 'no #fragment navigation under <base href="/">');
  assert.equal(main.getAttribute('tabindex'), '-1');
  assert.equal(browser.document.activeElement, main);

  // A main that is already focusable keeps its own tabindex; a missing one leaves the click alone.
  main.setAttribute('tabindex', '0');
  link.dispatchEvent(new browser.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(main.getAttribute('tabindex'), '0');
  main.remove();
  const missing = new browser.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(missing);
  assert.equal(missing.defaultPrevented, false);
});

test('both dashboards start with the skip link, have one h1 and a named sidebar, and "?" opens the shortcuts', async (t) => {
  const { StockDashboard } = await import('../src/app/stock-dashboard.ts');
  const { StockDashboardComponent } = await import('../src/app/stock-dashboard.component.ts');
  t.mock.method(StockDashboardComponent.prototype, 'ngAfterViewInit', () => {});
  const fixture = await render(t, StockDashboard, { name: 'Ada', level: 'NOVICE' });
  const root = fixture.nativeElement;
  for (const [level, dashboard] of [['NOVICE', 'app-novice-dashboard'], ['ADVANCED', 'app-advanced-dashboard']]) {
    fixture.componentRef.setInput('level', level);
    fixture.detectChanges();
    const first = root.querySelector('a[href], button, input, select, textarea');
    assert.equal(first.textContent.trim(), 'Skip to main content', `${level}: the skip link comes first`);
    const main = root.querySelector(`${dashboard} main`);
    assert.equal(main.id, MAIN_CONTENT_ID);
    assert.equal(main.getAttribute('tabindex'), '-1');
    assert.equal(root.querySelectorAll(`${dashboard} h1`).length, 1, `${level}: one h1`);
    assert.equal(root.querySelector(`${dashboard} aside`).getAttribute('aria-label'), 'Menu');
  }
  fixture.componentRef.setInput('level', 'NOVICE');
  fixture.detectChanges();
  const dialog = root.querySelector('app-novice-dashboard dialog.detail-dialog');
  assert.equal(dialog.open, false);
  browser.document.dispatchEvent(new browser.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
  fixture.detectChanges();
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('h2').textContent.trim(), 'Keyboard shortcuts');
});
