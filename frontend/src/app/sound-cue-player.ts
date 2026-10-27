import { Injectable, inject } from '@angular/core';
import { accessibilityStore } from './accessibility';
import { SoundCues, type GestureTarget, type SoundCue } from './sound-cues';
import { parseAssistivePreferences } from '../../../shared/assistive-preferences';

/**
 * The app's one set of sound cues (PS-22). Played by switch control (ring tick, keypad click), the
 * order toasts (fill, rejection) and the "Still there?" warning. The Sound cues setting and the
 * volume live with the voice settings in the Accessibility settings store, and are read on every
 * cue, so a change applies to the next sound. Sound cues are independent of speech: they play with
 * voice mode off, and turning them off never silences speech. Nothing is added to the page, so
 * screen readers notice no difference.
 */
@Injectable({ providedIn: 'root' })
export class SoundCuePlayer {
  readonly #store = accessibilityStore();
  readonly #cues = new SoundCues({
    enabled: () => this.#settings().soundCues,
    volume: () => this.#settings().volume,
  });

  /** Plays a cue when sound cues are on and the person has already pressed a key or clicked. */
  play(cue: SoundCue): boolean {
    return this.#cues.play(cue);
  }

  /** Browsers allow audio only after a key press or click; call once from the app root. */
  unlockOnGesture(target?: GestureTarget): () => void {
    return this.#cues.unlockOnGesture(target);
  }

  dispose(): void {
    this.#cues.dispose();
  }

  #settings() {
    return this.#store.read('voice', (voice) => parseAssistivePreferences(voice));
  }
}

/** The app's player; plain unit tests without an injector get one of their own. */
export function soundCuePlayer(): SoundCuePlayer {
  try {
    return inject(SoundCuePlayer);
  } catch {
    return new SoundCuePlayer();
  }
}
