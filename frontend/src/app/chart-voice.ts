import { Injectable, computed, effect, inject } from '@angular/core';
import { AccessibilityStore } from './accessibility';
import { SwitchScanService } from './switch-scan';
import { ChartNarrator } from '../../../shared/chart-narrator';
import { speakable } from './speech-text';

@Injectable({ providedIn: 'root' })
export class ChartVoice {
  readonly #store = inject(AccessibilityStore);
  readonly #scan = inject(SwitchScanService, { optional: true });
  readonly narrator = new ChartNarrator();
  readonly enabled = computed(() => this.#store.read('voice', value => {
    const saved = value as { enabled?: boolean; chartSummaries?: boolean } | null;
    return typeof saved?.chartSummaries === 'boolean' ? saved.chartSummaries : saved?.enabled === true;
  }));
  constructor() {
    effect(() => {
      if (this.#scan?.settings().enabled) { this.narrator.stop(this.#owner); }
    });
  }
  setEnabled(enabled: boolean): void {
    const saved = this.#store.read('voice', v => v && typeof v === 'object' ? v : {});
    this.#store.write('voice', { ...saved, chartSummaries: enabled });
    if (!enabled) { this.narrator.stop(this.#owner); }
  }
  #owner = '';
  #pending: { owner: string; timer: ReturnType<typeof setTimeout> } | undefined;
  speak(text: string, owner: string, requested = false): void {
    if (this.#scan?.settings().enabled) {
      // The scanner owns focus speech. Only an explicit Explain request adds narration,
      // after the scanner has given its normal button-selection confirmation.
      if (requested && this.#scan.settings().speak) {
        if (this.#pending) { clearTimeout(this.#pending.timer); }
        this.#pending = { owner, timer: setTimeout(() => {
          this.#pending = undefined;
          if (this.#scan?.settings().enabled && this.#scan.settings().speak) { this.#scan.announce(text); }
        }, 0) };
      }
      return;
    }
    if (!this.enabled()) { return; }
    const navigationVoice = this.#store.read('voice', v => v as { enabled?: boolean; focus?: boolean; rate?: number } | null);
    if (!requested && navigationVoice?.enabled && navigationVoice.focus) { return; }
    this.#owner = owner;
    const rate = navigationVoice?.enabled ? navigationVoice.rate || 1 : this.#store.read('briefing', v => Number((v as { rate?: number } | null)?.rate) || 1);
    this.narrator.speak(speakable(text), owner, rate);
  }
  stop(owner: string): void {
    if (this.#pending?.owner === owner) { clearTimeout(this.#pending.timer); this.#pending = undefined; }
    this.narrator.stop(owner);
  }
}
