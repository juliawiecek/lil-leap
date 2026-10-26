/** A phrase starting or finishing (PS-23 captions). `end` also covers errors and Stop. */
export interface SpeechEvent { owner: string; text: string; phase: 'start' | 'end' }

/** A single owner of browser speech. Screen readers are never detected or controlled. */
export class SpeechCoordinator {
  private synth: SpeechSynthesis | undefined;
  private pending = new Map<SpeechSynthesisUtterance, { owner: string; done: () => void; started?: boolean }>();
  private preferences: () => { voiceURI?: string; volume?: number } = () => ({});
  private listeners = new Set<(owner: string, active: boolean) => void>();
  private observers = new Set<(event: SpeechEvent) => void>();
  configure(preferences: () => { voiceURI?: string; volume?: number }): void { this.preferences = preferences; }
  /**
   * Every phrase as it starts and ends, whoever speaks it (PS-23 captions). A queued phrase starts
   * when the browser begins it, or when the phrase ahead of it finishes, whichever comes first.
   */
  observe(listener: (event: SpeechEvent) => void): () => void {
    this.observers.add(listener); return () => this.observers.delete(listener);
  }
  private began(utterance: SpeechSynthesisUtterance): void {
    const entry = this.pending.get(utterance);
    if (!entry || entry.started) return;
    entry.started = true;
    for (const observer of this.observers) observer({ owner: entry.owner, text: utterance.text, phase: 'start' });
  }
  get supported(): boolean { return !!globalThis.speechSynthesis && typeof globalThis.SpeechSynthesisUtterance === 'function'; }
  get speaking(): boolean { this.current(); return this.pending.size > 0; }
  get paused(): boolean { return !!globalThis.speechSynthesis?.paused; }
  get owner(): string { return [...this.pending.values()].at(-1)?.owner ?? ''; }
  subscribe(listener: (owner: string, active: boolean) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  private current(): SpeechSynthesis | undefined {
    const next = globalThis.speechSynthesis;
    if (next !== this.synth) { this.pending.clear(); this.synth = next; }
    return next;
  }
  submit(owner: string, utterance: SpeechSynthesisUtterance, options: { interrupt?: boolean; queue?: boolean; defaultVoice?: boolean } = {}): boolean {
    const synth = this.current();
    if (!synth || !this.supported || !utterance.text) return false;
    // Passive readers never interrupt another channel. Explicit reading/briefing may replace it.
    if (this.owner && this.owner !== owner && !options.interrupt) return false;
    if (!this.owner && synth.speaking && !options.interrupt) return false;
    if (options.interrupt || (!options.queue && this.owner === owner)) this.stop();
    if (synth.paused) synth.resume?.();
    const preferences = this.preferences();
    utterance.volume = preferences.volume ?? 1;
    const voices = synth.getVoices?.() ?? [];
    const local = voices.filter(voice => voice.localService);
    // Never choose an online voice for financial/account content. Switch control and the briefing
    // (`defaultVoice`) spoke with the browser's own voice before this coordinator existed; they keep
    // doing so while no local voice is known (Chrome lists voices only after `voiceschanged`), or a
    // switch user would hear nothing at all.
    if (typeof synth.getVoices === 'function' && !local.length && !options.defaultVoice) return false;
    if (local.length) utterance.voice = local.find(v => v.voiceURI === preferences.voiceURI) ?? local.find(v => v.default) ?? local[0];
    const ended = utterance.onend, failed = utterance.onerror, starting = utterance.onstart;
    const entry: { owner: string; done: () => void; started?: boolean } = { owner, done: () => {
      finish(); failed?.call(utterance, { error: 'canceled' } as SpeechSynthesisErrorEvent);
    } };
    let reported = false;
    const finish = () => {
      this.pending.delete(utterance);
      if (entry.started && !reported) {
        reported = true;
        for (const observer of this.observers) observer({ owner, text: utterance.text, phase: 'end' });
      }
      // The browser reads in order: once nothing ahead is playing, the next phrase has begun.
      const next = [...this.pending.keys()][0];
      if (next && ![...this.pending.values()].some(item => item.started)) this.began(next);
      for (const listener of this.listeners) listener(owner, [...this.pending.values()].some(item => item.owner === owner));
    };
    utterance.onstart = event => { this.began(utterance); starting?.call(utterance, event); };
    utterance.onend = event => { finish(); ended?.call(utterance, event); };
    utterance.onerror = event => { finish(); failed?.call(utterance, event); };
    this.pending.set(utterance, entry);
    for (const listener of this.listeners) listener(owner, true);
    if (this.pending.size === 1) this.began(utterance);
    try { synth.speak(utterance); return true; }
    catch { this.pending.get(utterance)?.done(); return false; }
  }
  stop(owner?: string): void {
    this.current();
    if (owner && ![...this.pending.values()].some(item => item.owner === owner)) return;
    // Browser cancellation is global. Only stop an owned channel (or an explicit Stop all).
    if (owner && [...this.pending.values()].some(item => item.owner !== owner)) return;
    const pending = [...this.pending.values()]; this.pending.clear();
    globalThis.speechSynthesis?.cancel();
    if (globalThis.speechSynthesis?.paused) globalThis.speechSynthesis.resume?.();
    pending.forEach(item => item.done());
  }
  pause(): void { if (this.pending.size) globalThis.speechSynthesis?.pause?.(); }
  resume(): void { globalThis.speechSynthesis?.resume?.(); }
  /** Existing scanner/briefing APIs keep their own timing and callbacks. */
  channel(owner: string): Pick<SpeechSynthesis, 'speaking' | 'speak' | 'cancel'> {
    const coordinator = this;
    return {
      get speaking() { return !!globalThis.speechSynthesis?.speaking; },
      speak(utterance) {
        if (!coordinator.submit(owner, utterance, { queue: true, defaultVoice: true })) {
          utterance.onerror?.call(utterance, { error: 'synthesis-unavailable' } as SpeechSynthesisErrorEvent);
        }
      },
      cancel() { coordinator.stop(owner); },
    };
  }
}
export const speechCoordinator = new SpeechCoordinator();
