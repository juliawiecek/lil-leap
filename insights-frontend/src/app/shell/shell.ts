import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../auth.service';
import { AppSessionService } from '../app-session.service';
import { NAV_BY_ROLE, homePath, roleOf, type NavItem } from '../roles';
import { DashboardIcon } from '../shared/dashboard-icon';

/** Central time for the top bar: the team works in Texas, so every time in Insights is Central. */
const CENTRAL_CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' });
/** "3:59 PM" on a 12-hour clock; newer ICU puts a narrow no-break space before AM/PM, so use a plain space. */
const centralClock = (now: Date) => CENTRAL_CLOCK.format(now).replace(/\u202f/g, ' ');

/** The Insights frame around every page: sidebar for the signed-in role, top bar and sign-out. */
@Component({
  selector: 'app-insights-workspace',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DashboardIcon],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnDestroy {
  readonly auth = inject(AuthService, { optional: true });
  private readonly session = inject(AppSessionService, { optional: true });
  private readonly router = inject(Router, { optional: true });
  readonly mobileNav = signal(false);
  /** The time in Central, refreshed twice a minute. */
  readonly clock = signal(centralClock(new Date()));
  readonly #clockTimer = setInterval(() => this.clock.set(centralClock(new Date())), 30_000);

  role() {
    return roleOf(this.auth?.userRole);
  }
  roleLabel(): string {
    return this.role() === 'OPERATIONS' ? 'Operations' : 'Analyst';
  }
  nav(): readonly NavItem[] {
    return NAV_BY_ROLE[this.role()];
  }
  home(): string {
    return homePath(this.auth?.userRole);
  }
  initial(): string {
    return this.auth?.email?.charAt(0).toUpperCase() || '?';
  }
  /** The page being viewed and its group, for the top bar ("Analytics / Insights"). */
  current(): NavItem {
    const url = this.router?.url ?? '';
    return this.nav().find((item) => url.startsWith(item.path)) ?? this.nav()[0];
  }
  async signOut(): Promise<void> {
    await this.session?.logout();
    await this.router?.navigate(['/login'], { replaceUrl: true });
  }
  ngOnDestroy(): void {
    clearInterval(this.#clockTimer);
  }
}
