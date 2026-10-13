import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthApiError } from '../../../frontend-shared/auth-api.ts';

@Component({
  selector: 'app-insights-login',
  template: `
    <main class="login-card">
      <h1>NextTrade Insights</h1><p>Sign in to your analyst workspace.</p>
      <form (submit)="signIn($event, email.value, password.value)">
        <label for="analyst-email">Email</label>
        <input #email id="analyst-email" type="email" autocomplete="username" required />
        <label for="analyst-password">Password</label>
        <input #password id="analyst-password" type="password" autocomplete="current-password" required />
        <button type="submit" [disabled]="busy()">{{ busy() ? 'Signing in?' : 'Sign in' }}</button>
      </form>
      <p role="status">{{ message() }}</p>
    </main>`,
  styles: [`
    :host { display: grid; min-height: 100vh; place-items: center; }
    .login-card { width: min(420px, 90vw); padding: 32px; background: #171c1a; border: 1px solid #39443c; border-radius: 16px; }
    form { display: grid; gap: 12px; } input, button { padding: 12px; border-radius: 6px; }
    input { color: #eee; background: #0c1210; border: 1px solid #536455; } button { cursor: pointer; background: #78a85f; color: #0c1210; border: 0; }
  `],
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly message = signal(this.router.url.includes('expired=1') ? 'Your session has ended. Please sign in again.' : '');

  async signIn(event: Event, email: string, password: string): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      await this.auth.login(email, password);
      if (!this.auth.sessionValid || this.auth.userRole !== 'ANALYST') {
        await this.auth.logout();
        this.message.set('An analyst account is required to access Insights.');
        return;
      }
      await this.router.navigate(['/dashboard']);
    } catch (error) {
      this.message.set(error instanceof AuthApiError ? error.userMessage : 'Could not sign in. Please try again.');
    } finally { this.busy.set(false); }
  }
}
