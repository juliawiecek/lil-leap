import { glossaryHint } from './glossary';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AccessibilityStore } from './accessibility';
import { BRIEFING_RATES, BriefingService } from './briefing-button';
import { SwitchScanService } from '../../../shared/switch-scan';
import { ToastService } from './toasts';
import { voiceText } from './speech-text';
import { AssistiveController } from '../../../shared/assistive-controller';
import { mergeAssistivePreferences, parseAssistivePreferences, type AssistivePreferences } from '../../../shared/assistive-preferences';
import { speechCoordinator } from '../../../shared/speech-coordinator';

/** What voice mode says when it is turned on, matching the setting's name. */
export const VOICE_ON = 'Voice mode on.';

@Injectable({ providedIn: 'root' })
export class SiteAccessibility {
  private readonly store = inject(AccessibilityStore);
  private readonly scan = inject(SwitchScanService);
  private readonly briefing = inject(BriefingService);
  private readonly router = inject(Router, { optional: true });
  private readonly destroy = inject(DestroyRef);
  /**
   * Voice speed is one setting shared with the audio briefing (PS-22): the briefing's saved speed
   * wins, so a change made in either place is heard in both.
   */
  readonly settings = computed(() => {
    const settings = parseAssistivePreferences(this.store.read('voice', v => v), this.store.read('visual', v => v));
    const briefingRate = this.store.read('briefing', saved => (saved as { rate?: unknown } | undefined)?.rate);
    return BRIEFING_RATES.some(r => r.value === briefingRate) ? { ...settings, rate: briefingRate as number } : settings;
  });
  readonly status = signal('');
  readonly loginPage = signal(false);
  readonly speaking = signal(false);
  readonly paused = signal(false);
  readonly voices = signal<SpeechSynthesisVoice[]>([]);
  readonly supported = speechCoordinator.supported;
  /** This app plays sound cues, so Settings offers the Sound cues switch (Insights does not). */
  readonly soundCuesOffered = true;
  readonly controller = new AssistiveController(inject(DOCUMENT), {
    settings: () => this.settings(), status: text => this.status.set(text),
    state: (active, paused) => { this.speaking.set(active); this.paused.set(paused); },
    voices: voices => this.voices.set(voices), scanning: () => this.scan.settings().enabled,
    // Stop speech silences the current sentence only; turning off "Read items aloud" here would
    // leave a switch user with a silent ring until they found the setting again (PS-19).
    stopScanningSpeech: () => this.scan.hush(),
    // $, %, + and marks such as ★ and × are said as words or left out, never read literally.
    format: voiceText, hint: glossaryHint,
  });
  private started = false;
  constructor() {
    effect(() => { this.settings(); this.controller.apply(); });
    effect(() => {
      if (this.scan.settings().enabled) {
        for (const owner of ['assist:focus', 'assist:hover', 'assist:request']) { speechCoordinator.stop(owner); }
      }
    });
    // A fill or rejection cuts in on polite reading, so the outcome of a trade is heard at once.
    // The toast is the written form of the same message; nothing is said while voice mode is off.
    const toasts = inject(ToastService);
    let seen = 0;
    effect(() => {
      const fresh = toasts.toasts().filter(toast => toast.id > seen);
      seen = Math.max(seen, ...fresh.map(toast => toast.id));
      untracked(() => fresh.filter(toast => toast.kind !== 'info')
        .forEach(toast => this.controller.announce(`${toast.title}. ${toast.detail}`, true)));
    });
  }
  start(): void {
    if (this.started) { return; }
    this.started = true; this.controller.start();
    this.loginPage.set(/^\/(login|reset-password)(?:[?#]|$)/.test(this.router?.url ?? ''));
    const subscription = this.router?.events?.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.loginPage.set(/^\/(login|reset-password)(?:[?#]|$)/.test(event.urlAfterRedirects));
        this.controller.routeChanged(event.urlAfterRedirects);
      }
    });
    this.destroy.onDestroy(() => { subscription?.unsubscribe(); this.controller.destroy(); });
  }
  openSettings(): void { void this.router?.navigate(['/settings']); }
  update(patch: Partial<AssistivePreferences>): void {
    const wasOn = this.settings().enabled;
    const next = mergeAssistivePreferences(this.store.read('voice', v => v), this.store.read('visual', v => v), patch);
    this.store.write('voice', next.voice); this.store.write('visual', next.visual);
    if (patch.rate !== undefined) { this.briefing.update({ rate: next.voice.rate }); }
    if (patch.enabled === false) {
      // Off means quiet at once: whatever voice assistance was saying stops.
      for (const owner of ['assist:focus', 'assist:hover', 'assist:request', 'assist:announce', 'assist:alert']) { speechCoordinator.stop(owner); }
    } else if (patch.enabled === true && !wasOn) {
      this.controller.announce(VOICE_ON);
    }
  }
  /** Says a message from the app while voice mode is on; `urgent` cuts in (the "Still there?" warning). */
  announce(text: string, urgent = false): void {
    this.controller.announce(text, urgent);
  }
}
