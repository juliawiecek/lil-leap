import { Component, DestroyRef, effect, inject, untracked } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SessionTimeoutWarning } from '@lilleap/session-core/angular';
import { AppSessionService } from './app-session.service';
import { AssistiveTools } from './assistive-tools';
import { SiteAccessibility } from './site-accessibility';
import { SoundCuePlayer } from './sound-cue-player';

/** Said by voice mode as the "Still there?" warning opens, with its two-beep sound cue. */
export const STILL_THERE = 'Still there? You will be signed out soon because there has been no activity. Choose Stay signed in to continue.';

/** Hosts the pages, the site-wide assistive tools (PS-22) and the "Still there?" warning before the inactivity sign-out (PS-30). */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SessionTimeoutWarning, AssistiveTools],
  template: '<router-outlet /><app-assistive-tools /><lil-session-timeout-warning [session]="session" />',
})
export class AppRoot {
  readonly session = inject(AppSessionService);
  readonly #access = inject(SiteAccessibility);
  readonly #cues = inject(SoundCuePlayer);

  constructor() {
    // Browsers allow sound only after the person has pressed a key or clicked (PS-22).
    const stopListening = this.#cues.unlockOnGesture(inject(DOCUMENT));
    inject(DestroyRef).onDestroy(() => { stopListening(); this.#cues.dispose(); });
    let warned = false;
    effect(() => {
      const warning = this.session.warningSecondsLeft() !== null;
      if (warning && !warned) {
        untracked(() => { this.#cues.play('warning'); this.#access.announce(STILL_THERE, true); });
      }
      warned = warning;
    });
  }
}
