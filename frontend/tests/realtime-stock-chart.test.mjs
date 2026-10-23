import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Subject } from 'rxjs';
import { browser, animateFrame, resolveTemplates } from './dom-helper.mjs';
const { RealtimeStockChart } = await import('../src/app/realtime-stock-chart.ts');
const { STOCK_PRICE_TICKS } = await import('../src/app/stock-price-ticks.ts');
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
test('reusable SVG wrapper samples updates, keeps the emerald area style, handles errors and tears down', async (t) => {
  await resolveTemplates();
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  globalThis.ResizeObserver = browser.ResizeObserver;
  t.mock.method(browser.SVGElement.prototype, 'getBoundingClientRect', () => ({
    width: 600,
    height: 280,
    left: 0,
    top: 0,
  }));
  const feed = new Subject();
  TestBed.configureTestingModule({
    imports: [RealtimeStockChart],
    providers: [{ provide: STOCK_PRICE_TICKS, useValue: feed }],
  });
  t.after(() => TestBed.resetTestingModule());
  const fixture = TestBed.createComponent(RealtimeStockChart);
  fixture.componentRef.setInput('openingPrice', 100);
  fixture.detectChanges();
  feed.next({ time: 100, price: 99 });
  feed.next({ time: 101, price: 102 });
  const line = fixture.nativeElement.querySelector('[data-line]');
  assert.equal(line.getAttribute('d'), '');
  t.mock.timers.tick(5000);
  fixture.detectChanges();
  assert.equal(line.getAttribute('stroke'), 'var(--area-line)');
  feed.next({ time: 106, price: 98 });
  t.mock.timers.tick(5000);
  animateFrame(performance.now() + 1000);
  fixture.detectChanges();
  assert.equal(line.getAttribute('stroke'), 'var(--area-line)');
  assert.match(line.getAttribute('d'), /^M/);
  feed.error(new Error('Disconnected'));
  fixture.detectChanges();
  assert.match(fixture.nativeElement.textContent, /Live prices are unavailable/);
  fixture.destroy();
  assert.equal(feed.observed, false);
});
