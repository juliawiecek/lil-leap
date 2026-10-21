import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** A friendly page for an address that does not exist, instead of a silent redirect (PS-11). */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <main class="not-found">
      <p class="code">404</p>
      <h1>We can't find that page</h1>
      <p>The link may be old, or the address may have a typo. Your account and orders are not affected.</p>
      <a routerLink="/dashboard">Back to your dashboard</a>
    </main>
  `,
  styles: [`
    :host { display: grid; min-height: 100vh; place-items: center; background: var(--surface); color: var(--text); font-family: inherit; }
    .not-found { max-width: 440px; padding: 32px 16px; text-align: center; }
    .code { margin: 0; color: var(--gain); font-size: 14px; font-weight: 700; letter-spacing: .2em; }
    h1 { margin: 8px 0 12px; font-size: 28px; }
    p { margin: 0 0 24px; color: var(--text-muted); line-height: 1.5; }
    a { display: inline-block; padding: 10px 18px; border-radius: 8px; background: var(--gain); color: var(--surface); font-weight: 600; text-decoration: none; }
    a:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
  `],
})
export class NotFound {}
