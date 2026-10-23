import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import type { UserProfile } from './auth-api';

/**
 * The signed-in trader's contact profile, shared by the dashboards and Settings so a change saved
 * in Settings (PS-07) shows everywhere at once.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly auth = inject(AuthService);

  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const accessToken = this.auth.accessToken;
      const userId = userIdFromToken(accessToken);
      if (!accessToken || !userId) {
        throw new Error('Your profile could not be loaded. Please sign in again.');
      }
      const response = await fetch(`/auth/users/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error('Your profile could not be loaded. Please try again.');
      }
      this.profile.set((await response.json()) as UserProfile);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Profile details could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Merges saved changes into the profile on screen. */
  update(changes: Partial<UserProfile>): void {
    const current = this.profile();
    if (current) {
      this.profile.set({ ...current, ...changes });
    }
  }
}

function userIdFromToken(token: string | null): string | null {
  const payload = token?.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const claims = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}
