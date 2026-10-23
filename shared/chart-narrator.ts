import { speechCoordinator } from './speech-coordinator.ts';
/** Chart speech participates in the shared coordinator without interrupting higher-priority reading. */
export class ChartNarrator {
  private utterance: SpeechSynthesisUtterance | undefined;
  private ownerId = '';
  speak(text: string, owner: string, rate = 1): boolean {
    const synth = globalThis.speechSynthesis;
    if (!text || !synth || typeof globalThis.SpeechSynthesisUtterance !== 'function') return false;
    if (synth.speaking && !this.utterance) return false;
    this.stop(this.ownerId);
    const utterance = new SpeechSynthesisUtterance(text);
    this.ownerId = owner;
    this.utterance = utterance;
    utterance.rate = rate;
    const done = () => { if (this.utterance === utterance) this.utterance = undefined; };
    utterance.onend = done; utterance.onerror = done;
    const started = speechCoordinator.submit('chart:' + owner, utterance);
    if (!started) this.utterance = undefined;
    return started;
  }
  stop(owner: string): void {
    if (this.utterance && this.ownerId === owner) {
      speechCoordinator.stop('chart:' + owner); this.utterance = undefined;
    }
  }
}
