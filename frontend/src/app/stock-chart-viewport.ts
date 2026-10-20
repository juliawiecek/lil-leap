import type { StockPriceTick } from './stock-price-ticks';
import {
  normalizeHistory,
  priceDomain,
  validPrice,
  visiblePoints,
  type ChartRange,
} from './stock-chart-math';
/** Native time-based viewport. It never synthesizes prices or fills absent timestamps. */
export class StockChartViewport {
  #points: StockPriceTick[] = [];
  #range: ChartRange | undefined;
  #frame: number | undefined;
  #paused = false;
  #destroyed = false;
  #seconds = 86400;
  #fittedSpan: number | undefined;
  readonly #render: (points: readonly StockPriceTick[], range: ChartRange) => void;
  readonly #reducedMotion: () => boolean;
  constructor(
    render: (points: readonly StockPriceTick[], range: ChartRange) => void,
    seconds = 86400,
    reducedMotion = () => false,
  ) {
    this.#render = render;
    this.#reducedMotion = reducedMotion;
    this.setWindowSeconds(seconds);
  }
  setWindowSeconds(seconds: number): void {
    if (!Number.isInteger(seconds) || seconds < 2 || seconds > 86400)
      throw new RangeError('windowSeconds must be between 2 and 86400.');
    if (seconds === this.#seconds) return;
    this.#seconds = seconds;
    this.#fittedSpan = undefined;
    if (!this.#paused) this.#move(false);
  }
  setHistory(points: readonly StockPriceTick[]): void {
    if (this.#destroyed) return;
    this.#paused = false;
    this.#points = normalizeHistory(points);
    this.#fittedSpan = undefined;
    if (!this.#points.length) {
      this.#cancel();
      this.#range = undefined;
    }
    this.#move(false);
  }
  append(point: StockPriceTick): void {
    if (this.#destroyed || !validPrice(point)) return;
    const last = this.#points.at(-1);
    if (last && point.time < last.time) return;
    if (last?.time === point.time) {
      if (last.price === point.price) return;
      this.#points[this.#points.length - 1] = { ...point };
    } else this.#points.push({ ...point });
    if (!this.#paused) this.#move(!!last);
  }
  pause(): void {
    this.#paused = true;
    this.#cancel();
  }
  resume(): void {
    if (!this.#paused) return;
    this.#paused = false;
    this.#move(true);
  }
  refresh(): void {
    if (this.#range && !this.#destroyed) this.#render(this.#points, this.#range);
  }
  finishAnimation(): void {
    if (!this.#paused) this.#move(false);
  }
  destroy(): void {
    this.#destroyed = true;
    this.#cancel();
    this.#points = [];
  }
  #move(animate: boolean): void {
    this.#cancel();
    const latest = this.#points.at(-1);
    if (!latest || this.#destroyed) return;
    const span =
      this.#seconds === 86400
        ? (this.#fittedSpan ??= Math.min(
            86400,
            Math.max(60, (latest.time - this.#points[0].time) * 1.02),
          ))
        : this.#seconds;
    const to = latest.time + span * 0.01,
      from = to - span;
    const domain = priceDomain(visiblePoints(this.#points, from, to));
    const target: ChartRange = { from, to, ...domain, reveal: latest.time };
    const origin = this.#range;
    if (!animate || !origin || this.#reducedMotion()) {
      this.#show(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / 240));
      const ease = progress * progress * (3 - 2 * progress);
      const lerp = (a: number, b: number) => a + (b - a) * ease;
      this.#show({
        from: lerp(origin.from, target.from),
        to: lerp(origin.to, target.to),
        min: lerp(origin.min, target.min),
        max: lerp(origin.max, target.max),
        reveal: lerp(origin.reveal, target.reveal),
      });
      this.#frame = progress < 1 ? requestAnimationFrame(step) : undefined;
    };
    this.#frame = requestAnimationFrame(step);
  }
  #show(range: ChartRange): void {
    this.#range = range;
    this.#render(this.#points, range);
  }
  #cancel(): void {
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
  }
}
