import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionTimeoutWarning } from '@lilleap/session-core/angular';
import { AppSessionService } from './app-session.service';
/** Hosts the pages and the "Still there?" warning before the inactivity sign-out (PS-30). */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SessionTimeoutWarning],
  template: '<router-outlet /><lil-session-timeout-warning [session]="session" />',
})
export class AppRoot {
  readonly session = inject(AppSessionService);
}
