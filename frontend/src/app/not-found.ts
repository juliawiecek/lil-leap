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
    :host { display: grid; min-height: 100vh; place-items: center; background: #0b0f10; color: #e7ecea; font-family: inherit; }
    .not-found { max-width: 440px; padding: 32px 16px; text-align: center; }
    .code { margin: 0; color: #63ca74; font-size: 14px; font-weight: 700; letter-spacing: .2em; }
    h1 { margin: 8px 0 12px; font-size: 28px; }
    p { margin: 0 0 24px; color: #a5b0ad; line-height: 1.5; }
    a { display: inline-block; padding: 10px 18px; border-radius: 8px; background: #63ca74; color: #0b0f10; font-weight: 600; text-decoration: none; }
    a:focus-visible { outline: 2px solid #e7ecea; outline-offset: 3px; }
  `],
})
export class NotFound {}
