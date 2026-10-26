import { SWITCH_SCAN_STORE } from '../../../shared/switch-scan-options';
import { SwitchScanService } from '../../../shared/switch-scan';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AssistiveController } from '../../../shared/assistive-controller';
import { mergeAssistivePreferences, parseAssistivePreferences, type AssistivePreferences } from '../../../shared/assistive-preferences';
import { speechCoordinator } from '../../../shared/speech-coordinator';

export const INSIGHTS_ACCESSIBILITY_KEY = 'nexttrade-insights.accessibility';
function saved(): { voice?: unknown; visual?: unknown } {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(INSIGHTS_ACCESSIBILITY_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  catch { return {}; }
}
@Injectable({ providedIn: 'root' })
export class SiteAccessibility {
  private readonly store = inject(SWITCH_SCAN_STORE);
  private readonly scan = inject(SwitchScanService);
  private readonly router = inject(Router, { optional: true });
  private readonly destroy = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  readonly settings = computed(() => parseAssistivePreferences(this.store.read('voice', v => v), this.store.read('visual', v => v)));
  readonly status = signal('');
  readonly loginPage = signal(false);
  readonly speaking = signal(false);
  readonly paused = signal(false);
  readonly voices = signal<SpeechSynthesisVoice[]>([]);
  readonly supported = speechCoordinator.supported;
  /** Insights plays no sound cues, so the shared settings leave out the Sound cues switch (PS-22). */
  readonly soundCuesOffered = false;
  readonly controller = new AssistiveController(this.document, {
    settings: () => this.settings(), status: text => this.status.set(text),
    state: (active, paused) => { this.speaking.set(active); this.paused.set(paused); },
    voices: voices => this.voices.set(voices), scanning: () => this.scan.settings().enabled, stopScanningSpeech: () => this.scan.hush(),
  });
  private started = false;
  constructor() { effect(() => { this.settings(); this.controller.apply(); }); }
  start(): void {
    if (this.started) { return; }
    this.started = true; this.controller.start();
    this.loginPage.set(/^\/login(?:[?#]|$)/.test(this.router?.url ?? ''));
    const subscription = this.router?.events?.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.loginPage.set(/^\/login(?:[?#]|$)/.test(event.urlAfterRedirects));
        const title = ({ login: 'Sign in', insights: 'Insights', clients: 'Clients', reports: 'Reports', trades: 'Trade lookup', settings: 'Settings' } as Record<string, string>)[event.urlAfterRedirects.split(/[/?#]/).filter(Boolean)[0]] || 'Insights';
        this.document.title = `${title} · NextTrade Insights`;
        this.controller.routeChanged(event.urlAfterRedirects);
      }
    });
    this.destroy.onDestroy(() => { subscription?.unsubscribe(); this.controller.destroy(); });
  }
  openSettings(): void { void this.router?.navigate(['/settings']); }
  update(patch: Partial<AssistivePreferences>): void {
    const next = mergeAssistivePreferences(this.store.read('voice', v => v), this.store.read('visual', v => v), patch);
    this.store.write('voice', next.voice); this.store.write('visual', next.visual);
    if (patch.enabled === false) { for (const owner of ['assist:focus', 'assist:hover', 'assist:request']) { speechCoordinator.stop(owner); } }
  }
}
