import { SwitchScanToggle } from '../../../shared/switch-scan-toggle';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { signedOutMessage } from '@lilleap/session-core/core';
import { AuthService } from './auth.service';
import { AuthApiError } from './auth-api';
import { AppSessionService } from './app-session.service';
import { safeReturnUrl } from './page-state';
import { homePath } from './roles';

/** Insights sign-in, laid out like the NextTrade sign-in; only analyst and operations staff get in. */
@Component({
  selector: 'app-insights-login',
  imports: [SwitchScanToggle],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly session = inject(AppSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly pending = signal(false);
  /** Starts with why the user is back here, e.g. after the inactivity sign-out (PS-30). */
  readonly message = signal(signedOutMessage(this.route.snapshot.queryParamMap.get('reason')));
  readonly passwordVisible = signal(false);
  /** Shown under a field left empty, instead of sending an empty sign-in. */
  readonly emailError = signal('');
  readonly passwordError = signal('');
  /** True while Caps Lock is on as the password is typed. */
  readonly capsLock = signal(false);

  checkCapsLock(event: KeyboardEvent): void {
    this.capsLock.set(typeof event.getModifierState === 'function' && event.getModifierState('CapsLock'));
  }
  /** Words on the moving band at the top; NextTrade shows index prices there. */
  readonly tape = ['Trading activity', 'Orders & fills', 'Client accounts', 'Reports', 'Trade lookup', 'Audit trail', 'US equities'];
  /** The same decorative candlestick chart NextTrade draws behind its sign-in. */
  readonly candles = Array.from({ length: 44 }, (_, index) => {
    const progress = index / 43;
    const priceAt = (step: number) => 440 - 340 * (step / 43) + Math.sin(step * 0.63) * 35 + Math.sin(step * 1.81) * 12;
    const close = priceAt(index);
    const open = priceAt(index - 1);
    return {
      x: 10 + index * 9.2,
      high: Math.min(open, close) - 6 - ((index * 7) % 17),
      low: Math.max(open, close) + 5 + ((index * 11) % 14),
      top: Math.min(open, close),
      height: Math.max(3, Math.abs(open - close)),
      falling: open < close,
      opacity: (0.15 + (Math.sin(index * 2.41 + 0.8) + 1) * 0.3) * (0.65 + progress * 0.35),
    };
  });
  async signIn(email: string, password: string): Promise<void> {
    if (this.pending()) { return; }
    this.emailError.set(email.trim() ? '' : 'Enter your email address.');
    this.passwordError.set(password ? '' : 'Enter your password.');
    if (!email.trim() || !password) { return; }
    this.pending.set(true); this.message.set('');
    try {
      await this.auth.login(email, password);
      if (this.auth.userRole !== 'ANALYST' && this.auth.userRole !== 'OPERATIONS') {
        void this.auth.logout();
        throw new AuthApiError('Please use an analyst or operations account to sign in to Insights.');
      }
      this.session.start();
      const requested = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl') ?? '');
      await this.router.navigateByUrl(requested ?? homePath(this.auth.userRole));
    } catch (error) {
      this.message.set(error instanceof AuthApiError ? error.userMessage : 'Something went wrong. Please try again.');
    } finally { this.pending.set(false); }
  }
}
