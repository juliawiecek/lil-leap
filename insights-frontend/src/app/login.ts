import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthApiError } from './auth-api';
import { AppSessionService } from './app-session.service';
import { safeReturnUrl } from './page-state';
@Component({ selector: 'app-insights-login', template: `
  <main class="login"><section aria-labelledby="login-title">
    <a href="/login" class="brand">Next<span>Trade</span></a><p>INSIGHTS / INTERNAL WORKSPACE</p>
    <h1 id="login-title">Welcome back</h1><p>Sign in with your analyst account.</p>
    <form (submit)="$event.preventDefault(); signIn(email.value, password.value)">
      <label>Email<input #email id="email" type="email" autocomplete="username" required /></label>
      <label>Password<input #password id="password" type="password" autocomplete="current-password" required /></label>
      @if (message()) { <p role="alert">{{ message() }}</p> }
      <button type="submit" [disabled]="pending()">{{ pending() ? 'Signing in...' : 'Sign in' }}</button>
    </form>
  </section></main>`, styles: [`
    :host { display:block; color:#eee; font-family:Inter,Arial,sans-serif; }
    .login { min-height:100vh; display:grid; place-items:center; background:#0c1011; padding:24px; box-sizing:border-box; }
    section { width:100%; max-width:400px; padding:32px; border:1px solid #343a36; border-radius:12px; background:#151b18; }
    .brand { color:#eee; font-size:26px; font-weight:700; text-decoration:none; } .brand span { color:#78a85f; }
    h1 { font-size:32px; } p { color:#a8b5ac; line-height:1.5; } label { display:block; margin:20px 0; }
    input { display:block; box-sizing:border-box; width:100%; margin-top:8px; padding:12px; background:#0c1011; border:1px solid #56635a; border-radius:6px; color:#eee; font:inherit; }
    button { width:100%; padding:13px; border:0; border-radius:6px; background:#78a85f; color:#101710; font:inherit; font-weight:600; cursor:pointer; } button:disabled { opacity:.6; } [role=alert] { color:#f7abab; }
  `] })
export class Login {
  private readonly auth = inject(AuthService);
  private readonly session = inject(AppSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly pending = signal(false);
  readonly message = signal('');
  async signIn(email: string, password: string): Promise<void> {
    if (this.pending()) { return; }
    this.pending.set(true); this.message.set('');
    try {
      await this.auth.login(email, password);
      if (this.auth.userRole !== 'ANALYST') {
        void this.auth.logout();
        throw new AuthApiError('Please use an analyst account to sign in to Insights.');
      }
      this.session.start();
      await this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl') ?? '') ?? '/dashboard');
    } catch (error) {
      this.message.set(error instanceof AuthApiError ? error.userMessage : 'Something went wrong. Please try again.');
    } finally { this.pending.set(false); }
  }
}
