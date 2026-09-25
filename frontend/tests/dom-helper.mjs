import './component-helper.mjs';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

export const browser = new Window({ url: 'http://localhost/' });
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement',
  'HTMLCanvasElement', 'HTMLDialogElement', 'Node', 'Event', 'InputEvent', 'MouseEvent',
  'KeyboardEvent', 'ErrorEvent', 'CustomEvent', 'Document', 'ShadowRoot']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? browser : browser[name] });
}
globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
// Drive animation frames explicitly so tests never run a perpetual animation loop.
const frames = new Map();
let nextFrame = 0;
globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
export function animateFrame(now) {
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(callback => callback(now));
}
browser.HTMLCanvasElement.prototype.getContext = () => null;
browser.HTMLElement.prototype.scrollTo = () => {};
browser.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
browser.HTMLDialogElement.prototype.close = function () { this.open = false; };

export async function resolveTemplates() {
  await ɵresolveComponentResources(url => Promise.resolve(
    url.endsWith('.html') ? readFileSync(new URL('../src/app/' + url, import.meta.url), 'utf8') : '',
  ));
}

let initialized = false;
export async function render(t, Type, inputs = {}, providers = []) {
  if (!initialized) {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    initialized = true;
  }
  await resolveTemplates();
  TestBed.configureTestingModule({ imports: [Type], providers });
  const fixture = TestBed.createComponent(Type);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  t.after(() => { TestBed.resetTestingModule(); frames.clear(); });
  fixture.detectChanges();
  return fixture;
}

export function input(fixture, selector, value, event = 'input') {
  const element = fixture.nativeElement.querySelector(selector);
  if (!element) throw new Error(`Missing input: ${selector}`);
  element.value = value;
  element.dispatchEvent(new browser.Event(event, { bubbles: true }));
  fixture.detectChanges();
  return element;
}

export function button(fixture, text) {
  const found = [...fixture.nativeElement.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  found.click(); fixture.detectChanges();
  return found;
}
