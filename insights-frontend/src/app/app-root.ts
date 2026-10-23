import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionTimeoutWarning } from '@lilleap/session-core/angular';
import { AppSessionService } from './app-session.service';
import { AssistiveTools } from './assistive-tools';
/** Hosts the pages, the site-wide assistive tools (PS-22) and the "Still there?" warning before the inactivity sign-out (PS-30). */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SessionTimeoutWarning, AssistiveTools],
  template: '<router-outlet /><app-assistive-tools /><lil-session-timeout-warning [session]="session" />',
})
export class AppRoot {
  readonly session = inject(AppSessionService);
}
