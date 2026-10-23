/**
 * A Web Audio stand-in that records what was asked of it: every context created, every node, and
 * every value scheduled on an audio parameter. Nothing makes a sound.
 */

export class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(value, time) { this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exp', value, time]); }
}

class FakeNode {
  constructor(context, kind) {
    this.kind = kind;
    this.connections = [];
    this.disconnected = false;
    context.nodes.push(this);
  }
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnected = true; }
}

class FakeOscillator extends FakeNode {
  constructor(context) {
    super(context, 'oscillator');
    this.type = 'sine';
    this.frequency = new FakeParam(440);
    this.startedAt = null;
    this.stops = [];
  }
  start(when = 0) { this.startedAt = when; }
  stop(when) { this.stops.push(when); }
}

export class FakeAudioContext {
  static instances = [];

  constructor({ panner = true } = {}) {
    FakeAudioContext.instances.push(this);
    this.nodes = [];
    this.state = 'suspended';
    this.currentTime = 0;
    this.resumes = 0;
    this.closed = false;
    this.destination = { kind: 'destination', connect() {}, disconnect() {} };
    if (!panner) this.createStereoPanner = undefined;
  }

  createOscillator() { return new FakeOscillator(this); }
  createGain() { return Object.assign(new FakeNode(this, 'gain'), { gain: new FakeParam(1) }); }
  createStereoPanner() { return Object.assign(new FakeNode(this, 'panner'), { pan: new FakeParam(0) }); }
  resume() { this.resumes += 1; this.state = 'running'; return Promise.resolve(); }
  close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }

  oscillators() { return this.nodes.filter((node) => node.kind === 'oscillator'); }
}

/** Installs `AudioContext` for one test; pass null for a browser without Web Audio. */
export function withAudioContext(t, Context = FakeAudioContext) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const beforeWebkit = Object.getOwnPropertyDescriptor(globalThis, 'webkitAudioContext');
  FakeAudioContext.instances = [];
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: Context });
  delete globalThis.webkitAudioContext;
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'AudioContext', before);
    else delete globalThis.AudioContext;
    if (beforeWebkit) Object.defineProperty(globalThis, 'webkitAudioContext', beforeWebkit);
  });
  return FakeAudioContext.instances;
}
