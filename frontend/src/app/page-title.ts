import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_NAME = 'NextTrade';

/** "Portfolio · NextTrade"; just "NextTrade" when a route has no title of its own (PS-20). */
export function pageTitle(title?: string | null): string {
  const page = title?.trim();
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}

/**
 * Each route names its page (app.routes.ts), and this adds the app name. The dashboards switch
 * pages through the router (PageState), so the tab title follows the visible page, Back and
 * Forward included.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.setTitle(pageTitle(this.buildTitle(snapshot)));
  }
}
