import { Component, OnInit, inject, output, signal } from '@angular/core';
import { AuthApiError } from './auth-api';
import { AuthService } from './auth.service';
import { TradingPreferencesService } from './trading-preferences.service';

@Component({
  selector: 'app-trader-settings',
  template: `
    <section class="settings-content" aria-labelledby="settings-heading">
      <h2 id="settings-heading">Account settings</h2>
      @if (message()) { <p class="settings-message" role="status">{{ message() }}</p> }
      <form (submit)="saveProfile($event)">
        <h3>Profile</h3>
        <label for="settings-phone">Phone</label>
        <input id="settings-phone" name="phone" autocomplete="tel" [value]="phone()" (input)="phone.set($any($event.target).value)" required maxlength="20" />
        <label for="settings-address">Street address</label>
        <input id="settings-address" name="address" autocomplete="street-address" [value]="address()" (input)="address.set($any($event.target).value)" required maxlength="1000" />
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save profile' }}</button>
      </form>
      <form (submit)="saveEmail($event)">
        <h3>Email</h3>
        <label for="settings-email">New email</label>
        <input id="settings-email" name="email" type="email" autocomplete="email" [value]="email()" (input)="email.set($any($event.target).value)" required />
        <label for="settings-email-password">Current password</label>
        <input id="settings-email-password" name="currentPassword" type="password" autocomplete="current-password" (input)="emailPassword.set($any($event.target).value)" required />
        <button type="submit" [disabled]="saving()">Change email</button>
      </form>
      <form (submit)="savePassword($event)">
        <h3>Password</h3>
        <label for="settings-current-password">Current password</label>
        <input id="settings-current-password" name="currentPassword" type="password" autocomplete="current-password" (input)="currentPassword.set($any($event.target).value)" required />
        <label for="settings-new-password">New password</label>
        <input id="settings-new-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" (input)="newPassword.set($any($event.target).value)" required />
        <button type="submit" [disabled]="saving()">Change password</button>
      </form>
      <section class="settings-preference">
        <h3>Price protection</h3>
        <p>Reserve extra cash so a buy can fill up to this percentage above the displayed price.</p>
        <div class="preference-control">
          <input id="settings-price-protection" type="range" min="0" max="10" step="0.25" [value]="priceProtectionPercent()" (input)="preferences.setPriceProtectionPercent(+$any($event.target).value)" />
          <output for="settings-price-protection">{{ priceProtectionPercent() }}%</output>
        </div>
      </section>
      <button type="button" class="settings-signout" (click)="signOutNow()">Sign out</button>
    </section>
  `,
  styles: [`
    .settings-content { display: grid; gap: 18px; max-width: 620px; }
    form, .settings-preference { display: grid; gap: 8px; padding: 16px; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; }
    h2, h3, p { margin: 0; }
    h3 { font-size: 16px; }
    label { font-size: 13px; }
    input:not([type="range"]) { min-height: 38px; padding: 8px 10px; border: 1px solid rgba(255,255,255,.2); border-radius: 5px; background: rgba(0,0,0,.18); color: inherit; }
    button { justify-self: start; padding: 9px 14px; border: 0; border-radius: 5px; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .6; }
    .preference-control { display: flex; align-items: center; gap: 12px; }
    .preference-control input { flex: 1; }
    .settings-message { color: #b9e6a3; }
    .settings-signout { margin-top: 4px; }
  `],
})
export class TraderSettings implements OnInit {
  readonly signOut = output<void>();
  readonly auth = inject(AuthService);
  readonly preferences = inject(TradingPreferencesService);
  readonly priceProtectionPercent = this.preferences.priceProtectionPercent;
  readonly phone = signal('');
  readonly address = signal('');
  readonly email = signal(this.auth.email ?? '');
  readonly emailPassword = signal('');
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly saving = signal(false);
  readonly message = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const profile = await this.auth.getProfile();
      this.phone.set(profile.phone);
      this.address.set(profile.address);
    } catch (error) {
      this.message.set(this.messageFor(error, 'Could not load your profile.'));
    }
  }

  async saveProfile(event: Event): Promise<void> {
    event.preventDefault();
    this.message.set('');
    this.saving.set(true);
    try {
      await this.auth.updateProfile({ phone: this.phone().trim(), address: this.address().trim() });
      this.message.set('Profile saved.');
    } catch (error) {
      this.message.set(this.messageFor(error, 'Could not save your profile.'));
    } finally { this.saving.set(false); }
  }

  async saveEmail(event: Event): Promise<void> {
    event.preventDefault();
    this.message.set('');
    this.saving.set(true);
    try {
      await this.auth.changeEmail(this.email().trim(), this.emailPassword());
      this.signOut.emit();
    } catch (error) {
      this.message.set(this.messageFor(error, 'Could not change your email.'));
      this.saving.set(false);
    }
  }

  async savePassword(event: Event): Promise<void> {
    event.preventDefault();
    this.message.set('');
    this.saving.set(true);
    try {
      await this.auth.changePassword(this.currentPassword(), this.newPassword());
      this.signOut.emit();
    } catch (error) {
      this.message.set(this.messageFor(error, 'Could not change your password.'));
      this.saving.set(false);
    }
  }

  async signOutNow(): Promise<void> {
    await this.auth.logout();
    this.signOut.emit();
  }

  private messageFor(error: unknown, fallback: string): string {
    return error instanceof AuthApiError ? error.userMessage : fallback;
  }
}