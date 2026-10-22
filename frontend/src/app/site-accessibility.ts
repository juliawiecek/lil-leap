import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AccessibilityStore } from './accessibility';
import { SwitchScanService } from './switch-scan';
import { speakable } from './speech-text';
import { AssistiveController } from '../../../shared/assistive-controller';
import { mergeAssistivePreferences, parseAssistivePreferences, type AssistivePreferences } from '../../../shared/assistive-preferences';
import { speechCoordinator } from '../../../shared/speech-coordinator';

@Injectable({ providedIn: 'root' })
export class SiteAccessibility {
  private readonly store = inject(AccessibilityStore);
  private readonly scan = inject(SwitchScanService);
  private readonly router = inject(Router, { optional: true });
  private readonly destroy = inject(DestroyRef);
  readonly settings = computed(() => parseAssistivePreferences(this.store.read('voice', v => v), this.store.read('visual', v => v)));
  readonly status = signal('');
  readonly loginPage = signal(false);
  readonly speaking = signal(false);
  readonly paused = signal(false);
  readonly voices = signal<SpeechSynthesisVoice[]>([]);
  readonly supported = speechCoordinator.supported;
  readonly controller = new AssistiveController(inject(DOCUMENT), {
    settings: () => this.settings(), status: text => this.status.set(text),
    state: (active, paused) => { this.speaking.set(active); this.paused.set(paused); },
    voices: voices => this.voices.set(voices), scanning: () => this.scan.settings().enabled,
    stopScanningSpeech: () => { if (this.scan.settings().enabled) this.scan.update({ speak: false }); },
    format: speakable,
  });
  private started = false;
  constructor() {
    effect(() => { this.settings(); this.controller.apply(); });
    effect(() => {
      if (this.scan.settings().enabled) {
        for (const owner of ['assist:focus', 'assist:hover', 'assist:request']) speechCoordinator.stop(owner);
      }
    });
  }
  start(): void {
    if (this.started) return;
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
    const next = mergeAssistivePreferences(this.store.read('voice', v => v), this.store.read('visual', v => v), patch);
    this.store.write('voice', next.voice); this.store.write('visual', next.visual);
    if (patch.enabled === false) for (const owner of ['assist:focus', 'assist:hover', 'assist:request']) speechCoordinator.stop(owner);
  }
}
