import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { AuthApiError } from './auth-api';
import { ProfileStore } from './profile-store';
import { PASSWORD_RULES } from './password-rules';

/** Which detail is being edited; only one form is open at a time. */
export type SettingsForm = 'phone' | 'address' | 'email' | 'password';

/** Same phone shape the sign-up form accepts (and the server checks): optional +, 7-20 characters, 7+ digits. */
const PHONE_PATTERN = /^\+?[0-9() .-]{7,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FAILED = 'Something went wrong. Please try again.';

/**
 * Account settings rows (PS-07) shared by the novice and advanced dashboards: phone, address, email
 * and password, each with its own Change form. Saved contact details update the profile everywhere;
 * changing email or password asks for the current password, and a password change keeps this
 * device signed in while the server signs out the others.
 */
@Component({
  selector: 'app-account-settings',
  template: `
    <div class="rows" data-scan-group="Personal details and sign-in">
      @if (store.profile(); as profile) {
        <div class="row" [class.open]="editing() === 'phone'">
          <div class="summary">
            <span class="label" id="phone-label">Phone</span>
            <span class="value" data-a11y-sensitive>{{ profile.phone || 'Not provided' }}</span>
            <button type="button" class="change" aria-describedby="phone-label" [attr.aria-expanded]="editing() === 'phone'" (click)="toggle('phone')">
              {{ editing() === 'phone' ? 'Cancel' : 'Change' }}
            </button>
          </div>
          @if (editing() === 'phone') {
            <form class="edit" (submit)="savePhone($event, phone.value)" novalidate>
              <label for="settings-phone">New phone number</label>
              <input #phone id="settings-phone" type="tel" autocomplete="tel" maxlength="20" [value]="profile.phone" placeholder="312-555-0123" />
              <small>U.S. numbers like 312-555-0123. For other countries, start with + and the country code.</small>
              <div class="actions"><button type="submit" class="save" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save phone' }}</button></div>
            </form>
          }
        </div>

        <div class="row" [class.open]="editing() === 'address'">
          <div class="summary">
            <span class="label" id="address-label">Address</span>
            <span class="value" data-a11y-sensitive>{{ profile.address || 'Not provided' }}</span>
            <button type="button" class="change" aria-describedby="address-label" [attr.aria-expanded]="editing() === 'address'" (click)="toggle('address')">
              {{ editing() === 'address' ? 'Cancel' : 'Change' }}
            </button>
          </div>
          @if (editing() === 'address') {
            <form class="edit" (submit)="saveAddress($event, address.value)" novalidate>
              <label for="settings-address">New address</label>
              <textarea #address id="settings-address" rows="2" maxlength="255" autocomplete="street-address" [value]="profile.address"></textarea>
              <small>Street, apartment, city, state and ZIP code.</small>
              <div class="actions"><button type="submit" class="save" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save address' }}</button></div>
            </form>
          }
        </div>
      }

      <div class="row" [class.open]="editing() === 'email'">
        <div class="summary">
          <span class="label" id="email-label">Email</span>
          <span class="value" data-a11y-sensitive>{{ currentEmail() || 'Not available' }}</span>
          <button type="button" class="change" aria-describedby="email-label" [attr.aria-expanded]="editing() === 'email'" (click)="toggle('email')">
            {{ editing() === 'email' ? 'Cancel' : 'Change' }}
          </button>
        </div>
        @if (editing() === 'email') {
          <form class="edit" (submit)="saveEmail($event, newEmail.value, emailPassword.value)" novalidate>
            <label for="settings-email">New email</label>
            <input #newEmail id="settings-email" type="email" autocomplete="email" maxlength="255" placeholder="you@example.com" />
            <label for="settings-email-password">Current password</label>
            <input #emailPassword id="settings-email-password" type="password" autocomplete="current-password" maxlength="128" />
            <small>You'll sign in with the new email from now on. We'll let both addresses know.</small>
            <div class="actions"><button type="submit" class="save" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save email' }}</button></div>
          </form>
        }
      </div>

      <div class="row" [class.open]="editing() === 'password'">
        <div class="summary">
          <span class="label" id="password-label">Password</span>
          <span class="value" aria-label="Hidden">••••••••••</span>
          <button type="button" class="change" aria-describedby="password-label" [attr.aria-expanded]="editing() === 'password'" (click)="toggle('password')">
            {{ editing() === 'password' ? 'Cancel' : 'Change' }}
          </button>
        </div>
        @if (editing() === 'password') {
          <form class="edit" (submit)="savePassword($event, current.value, next.value, confirm.value)" novalidate>
            <label for="settings-current-password">Current password</label>
            <input #current id="settings-current-password" type="password" autocomplete="current-password" maxlength="128" />
            <label for="settings-new-password">New password</label>
            <input #next id="settings-new-password" type="password" autocomplete="new-password" maxlength="128" aria-describedby="settings-password-rules" (input)="draft.set(next.value)" />
            <ul class="rules" id="settings-password-rules" aria-live="polite">
              @for (rule of rules; track rule.label) {
                <li [class.met]="rule.test(draft())"><span aria-hidden="true">{{ rule.test(draft()) ? '✓' : '○' }}</span><span class="sr-only">{{ rule.test(draft()) ? 'Met: ' : 'Still needed: ' }}</span>{{ rule.label }}</li>
              }
            </ul>
            <label for="settings-confirm-password">Confirm new password</label>
            <input #confirm id="settings-confirm-password" type="password" autocomplete="new-password" maxlength="128" />
            <small>You'll stay signed in here. Every other device will be signed out.</small>
            <div class="actions"><button type="submit" class="save" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Change password' }}</button></div>
          </form>
        }
      </div>

      @if (message(); as note) {
        <p class="note" [class.error]="note.error" [attr.role]="note.error ? 'alert' : 'status'">{{ note.text }}</p>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .rows { display: grid; }
      .row { padding: 14px 0; border-bottom: 1px solid var(--line, var(--surface-tone-97)); }
      .row:first-child { padding-top: 0; }
      .row:last-of-type { border-bottom: 0; }
      .summary { display: grid; grid-template-columns: minmax(80px, 140px) minmax(0, 1fr) auto; align-items: center; gap: 16px; }
      .label { color: var(--text-muted); font-size: 14px; }
      .value { min-width: 0; font-size: 14px; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
      .change {
        min-height: 32px; padding: 0 12px; border: 1px solid var(--surface-tone-10); border-radius: 6px;
        background: transparent; color: var(--text); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
      }
      .change:hover { border-color: var(--text-muted); }
      .change:focus-visible, .save:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent, var(--gain)); outline-offset: 2px; }
      .edit { display: grid; gap: 8px; max-width: 460px; margin: 16px 0 4px auto; }
      .edit label { margin-top: 6px; color: var(--text-muted); font-size: 13px; font-weight: 600; }
      .edit input, .edit textarea {
        width: 100%; min-height: 42px; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--surface-tone-10);
        border-radius: 6px; background: var(--background); color: var(--text); font: inherit; font-size: 14px;
      }
      .edit textarea { resize: vertical; line-height: 1.45; }
      .edit input:focus, .edit textarea:focus { border-color: var(--gain); outline: none; }
      .edit small { color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
      .actions { display: flex; justify-content: flex-end; margin-top: 6px; }
      .save {
        min-height: 38px; padding: 0 18px; border: 0; border-radius: 6px; background: var(--gain); color: var(--on-accent);
        font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .save:disabled { opacity: 0.6; cursor: progress; }
      .rules { display: grid; gap: 4px; margin: 4px 0 2px; padding: 0; list-style: none; color: var(--text-muted); font-size: 12.5px; }
      .rules li { display: flex; gap: 8px; }
      .rules li.met { color: var(--gain); }
      .note { margin: 14px 0 0; color: var(--gain); font-size: 13px; line-height: 1.5; }
      .note.error { color: var(--loss); }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      @media (max-width: 600px) {
        .summary { grid-template-columns: minmax(0, 1fr) auto; }
        .value { grid-column: 1 / -1; grid-row: 2; text-align: left; }
        .edit { margin-left: 0; max-width: none; }
      }
    `,
  ],
})
export class AccountSettings {
  readonly store = inject(ProfileStore);
  private readonly auth = inject(AuthService);

  readonly rules = PASSWORD_RULES;
  readonly editing = signal<SettingsForm | null>(null);
  readonly saving = signal(false);
  readonly draft = signal('');
  readonly message = signal<{ text: string; error: boolean } | null>(null);
  /** The profile's email, falling back to the token's while the profile loads (staff have no profile). */
  readonly currentEmail = computed(() => this.store.profile()?.email ?? this.emailFromToken());

  toggle(form: SettingsForm): void {
    this.editing.set(this.editing() === form ? null : form);
    this.draft.set('');
    this.message.set(null);
  }

  async savePhone(event: Event, value: string): Promise<void> {
    event.preventDefault();
    const phone = value.trim();
    if (!PHONE_PATTERN.test(phone) || phone.replace(/\D/g, '').length < 7) {
      return this.fail('Enter a valid phone number with at least 7 digits, up to 20 characters.');
    }
    if (phone === this.store.profile()?.phone) {
      return this.done('That is already your phone number.');
    }
    await this.run(async () => {
      this.store.update(await this.auth.updateProfile({ phone }));
      return 'Phone number saved.';
    });
  }

  async saveAddress(event: Event, value: string): Promise<void> {
    event.preventDefault();
    const address = value.trim();
    if (!address) {
      return this.fail('Enter your address.');
    }
    if (address === this.store.profile()?.address) {
      return this.done('That is already your address.');
    }
    await this.run(async () => {
      this.store.update(await this.auth.updateProfile({ address }));
      return 'Address saved.';
    });
  }

  async saveEmail(event: Event, value: string, currentPassword: string): Promise<void> {
    event.preventDefault();
    const email = value.trim();
    if (!EMAIL_PATTERN.test(email)) {
      return this.fail('Enter a valid email address, like you@example.com.');
    }
    if (email.toLowerCase() === this.currentEmail()?.toLowerCase()) {
      return this.fail('That is already your email. Enter a different one.');
    }
    if (!currentPassword) {
      return this.fail('Enter your current password to change your email.');
    }
    await this.run(async () => {
      await this.auth.changeEmail(email, currentPassword);
      this.store.update({ email: email.toLowerCase() });
      return `Email changed to ${email.toLowerCase()}. Use it the next time you sign in.`;
    });
  }

  async savePassword(event: Event, currentPassword: string, newPassword: string, confirmation: string): Promise<void> {
    event.preventDefault();
    this.draft.set(newPassword);
    if (!currentPassword) {
      return this.fail('Enter your current password.');
    }
    if (!this.rules.every((rule) => rule.test(newPassword))) {
      return this.fail('Your new password needs to meet every requirement in the list.');
    }
    if (newPassword !== confirmation) {
      return this.fail('The new passwords do not match. Enter the same password in both fields.');
    }
    if (newPassword === currentPassword) {
      return this.fail('Choose a new password that is different from your current one.');
    }
    await this.run(async () => {
      await this.auth.changePassword(currentPassword, newPassword);
      return 'Password changed. You are still signed in here; every other device has been signed out.';
    });
  }

  /** Saves, closes the form on success and shows the result; a failure keeps the form open to fix. */
  private async run(save: () => Promise<string>): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.message.set(null);
    try {
      const done = await save();
      this.editing.set(null);
      this.draft.set('');
      this.done(done);
    } catch (error) {
      this.fail(error instanceof AuthApiError ? error.userMessage : FAILED);
    } finally {
      this.saving.set(false);
    }
  }

  private done(text: string): void {
    this.message.set({ text, error: false });
  }

  private fail(text: string): void {
    this.message.set({ text, error: true });
  }

  private emailFromToken(): string | null {
    return this.auth.email;
  }
}
