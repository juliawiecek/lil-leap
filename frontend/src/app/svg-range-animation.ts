import type { ChartRange } from './stock-chart-math';

/** Animate only coordinates. The caller retains every original observation and SVG element. */
export class SvgRangeAnimation {
  #current: ChartRange | undefined;
  #target: ChartRange | undefined;
  #frame: number | undefined;
  #destroyed = false;
  readonly #draw: (range: ChartRange) => void;
  readonly #reducedMotion: () => boolean;
  constructor(draw: (range: ChartRange) => void, reducedMotion: () => boolean) {
    this.#draw = draw;
    this.#reducedMotion = reducedMotion;
  }
  move(target: ChartRange, animate = true): void {
    if (this.#destroyed) {
      return;
    }
    this.cancel();
    this.#target = target;
    const origin = this.#current;
    if (!animate || !origin || this.#reducedMotion()) {
      this.#show(target);
      return;
    }
    this.#show(origin);
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / 240));
      const ease = progress * progress * (3 - 2 * progress);
      const mix = (a: number, b: number) => a + (b - a) * ease;
      this.#show({
        from: mix(origin.from, target.from),
        to: mix(origin.to, target.to),
        min: mix(origin.min, target.min),
        max: mix(origin.max, target.max),
        reveal: mix(origin.reveal, target.reveal),
      });
      this.#frame = progress < 1 ? requestAnimationFrame(step) : undefined;
    };
    this.#frame = requestAnimationFrame(step);
  }
  finish(): void {
    this.cancel();
    if (this.#target && !this.#destroyed) {
      this.#show(this.#target);
    }
  }
  cancel(): void {
    if (this.#frame !== undefined) {
      cancelAnimationFrame(this.#frame);
    }
    this.#frame = undefined;
  }
  destroy(): void {
    this.cancel();
    this.#destroyed = true;
  }
  #show(range: ChartRange): void {
    this.#current = range;
    this.#draw(range);
  }
}
