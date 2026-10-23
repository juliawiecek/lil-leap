import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../auth.service';
import { AppSessionService } from '../app-session.service';
import { NAV_BY_ROLE, homePath, roleOf, type NavItem } from '../roles';
import { DashboardIcon } from '../shared/dashboard-icon';

/** The Insights frame around every page: sidebar for the signed-in role, top bar and sign-out. */
@Component({
  selector: 'app-insights-workspace',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DashboardIcon],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  readonly auth = inject(AuthService, { optional: true });
  private readonly session = inject(AppSessionService, { optional: true });
  private readonly router = inject(Router, { optional: true });
  readonly mobileNav = signal(false);
  readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  closeNavigation(): void { this.mobileNav.set(false); this.menuButton()?.nativeElement.focus(); }

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
  async signOut(): Promise<void> {
    await this.session?.logout();
    await this.router?.navigate(['/login'], { replaceUrl: true });
  }
}
