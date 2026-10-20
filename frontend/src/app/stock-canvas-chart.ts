import type { StockChartPalette, StockChartPoint, StockChartRange, StockChartSurface } from './stock-chart-surface';

const CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const TIMESTAMP = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
});
type ScreenPoint = { x: number; y: number; price: number; time: number };

/** Dependency-free, high-DPI canvas. Instantiate and call only outside Angular. */
export class StockCanvasChart implements StockChartSurface {
  readonly #canvas = document.createElement('canvas');
  readonly #tooltip = document.createElement('div');
  readonly #context: CanvasRenderingContext2D;
  readonly #observer: ResizeObserver;
  readonly #events = new AbortController();
  #points: readonly StockChartPoint[] = [];
  #range: StockChartRange = { from: 0, to: 60 };
  #palette: StockChartPalette = { lineColor: '#94a3b8', topColor: 'rgba(148,163,184,.12)', bottomColor: 'rgba(148,163,184,0)' };
  #currency = 'USD';
  #formatPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  #pointer: number | undefined;
  #keyboardTime: number | undefined;
  #visible: ScreenPoint[] = [];
  #frame: number | undefined;
  #destroyed = false;

  constructor(readonly host: HTMLElement, readonly area = true) {
    this.#canvas.style.cssText = 'display:block;width:100%;height:100%;outline-offset:-3px;touch-action:pan-y';
    this.#canvas.tabIndex = 0;
    this.#canvas.setAttribute('role', 'img');
    this.#canvas.setAttribute('aria-label', 'Live stock price chart. Use left and right arrow keys to explore prices.');
    this.#tooltip.style.cssText = 'position:absolute;top:10px;left:16px;max-width:calc(100% - 32px);padding:8px 12px;border:1px solid #33443b;border-radius:10px;background:#132019;color:#e2e8f0;font:12px ui-sans-serif,system-ui;pointer-events:none;z-index:1';
    this.#tooltip.hidden = true;
    this.#tooltip.setAttribute('role', 'status');
    this.#tooltip.setAttribute('aria-live', 'off');
    const context = this.#canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable.');
    this.#context = context;
    this.host.append(this.#canvas, this.#tooltip);
    const signal = this.#events.signal;
    this.#canvas.addEventListener('pointermove', event => {
      this.#keyboardTime = undefined;
      this.#pointer = event.clientX - this.#canvas.getBoundingClientRect().left;
      this.#schedule();
    }, { signal });
    this.#canvas.addEventListener('pointerleave', () => this.#clearTracker(), { signal });
    this.#canvas.addEventListener('pointercancel', () => this.#clearTracker(), { signal });
    this.#canvas.addEventListener('blur', () => this.#clearTracker(), { signal });
    this.#canvas.addEventListener('keydown', event => {
      if (event.key === 'Escape') { this.#clearTracker(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !this.#visible.length) return;
      event.preventDefault();
      const points = this.#visible;
      let index = this.#keyboardTime === undefined ? points.length - 1 : points.findIndex(point => point.time >= this.#keyboardTime!);
      if (index < 0) index = points.length - 1;
      index = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1
        : Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
      this.#keyboardTime = points[index].time;
      this.#pointer = undefined;
      this.#tooltip.setAttribute('aria-live', 'polite');
      this.#schedule();
    }, { signal });
    this.#observer = new ResizeObserver(() => this.#schedule());
    this.#observer.observe(host);
    window.addEventListener('resize', () => this.#schedule(), { signal });
    this.#schedule();
  }

  setData(points: readonly StockChartPoint[]): void {
    this.#points = [...points];
    this.#clearTracker();
  }

  update(point: StockChartPoint): void {
    const points = this.#points as StockChartPoint[];
    if (points.at(-1)?.time === point.time) points[points.length - 1] = point;
    else points.push(point);
    this.#schedule();
  }

  setVisibleRange(range: StockChartRange): void {
    this.#range = range;
    this.#schedule();
  }

  applyOptions(palette: StockChartPalette, currency = this.#currency): void {
    this.#palette = palette;
    if (currency !== this.#currency) {
      this.#currency = currency;
      this.#formatPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    }
    this.#schedule();
  }

  destroy(): void {
    this.#destroyed = true;
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    this.#observer.disconnect();
    this.#events.abort();
    this.#canvas.remove();
    this.#tooltip.remove();
    this.#points = [];
    this.#visible = [];
  }

  #clearTracker(): void {
    this.#pointer = undefined;
    this.#keyboardTime = undefined;
    this.#tooltip.hidden = true;
    this.#tooltip.setAttribute('aria-live', 'off');
    this.#schedule();
  }

  #schedule(): void {
    if (this.#destroyed || this.#frame !== undefined) return;
    this.#frame = requestAnimationFrame(() => { this.#frame = undefined; this.#draw(); });
  }

  #draw(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
    if (this.#canvas.width !== pixelWidth || this.#canvas.height !== pixelHeight) {
      this.#canvas.width = pixelWidth; this.#canvas.height = pixelHeight;
    }
    const ctx = this.#context;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '11px ui-sans-serif, system-ui';
    const left = 16, top = 28, bottom = height - 30;
    // Size the price gutter for the actual currency and magnitude, including large prices.
    const candidates = this.#points.flatMap((point, i) => point.value !== undefined && i >= Math.floor(this.#range.from) - 1 && i <= Math.ceil(this.#range.to) + 1
      ? [{ ...point, value: point.value, index: i }] : []);
    if (!candidates.length) { this.#visible = []; this.#tooltip.hidden = true; return; }
    let min = Infinity, max = -Infinity;
    for (const point of candidates) { min = Math.min(min, point.value); max = Math.max(max, point.value); }
    const padding = Math.max((max - min) * .18, max * .0005, .01);
    min -= padding; max += padding;
    const gutter = Math.max(72, ctx.measureText(this.#formatPrice.format(max)).width + 20);
    const right = Math.max(left + 1, width - gutter);
    const x = (index: number) => left + (index - this.#range.from) / (this.#range.to - this.#range.from) * (right - left);
    const y = (price: number) => bottom - (price - min) / (max - min) * (bottom - top);
    const points = candidates.map(point => ({ x: x(point.index), y: y(point.value), price: point.value, time: point.time }));
    this.#visible = points.filter(point => point.x >= left && point.x <= right);
    ctx.save();
    ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    ctx.beginPath();
    this.#trace(points);
    if (this.area && points.length > 1) {
      ctx.lineTo(points.at(-1)!.x, bottom); ctx.lineTo(points[0].x, bottom); ctx.closePath();
      const gradient = ctx.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, this.#palette.topColor); gradient.addColorStop(1, this.#palette.bottomColor);
      ctx.fillStyle = gradient; ctx.fill();
    }
    ctx.beginPath(); this.#trace(points);
    ctx.strokeStyle = this.#palette.lineColor; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    const latest = points.at(-1)!;
    ctx.beginPath(); ctx.arc(latest.x, latest.y, 3, 0, Math.PI * 2); ctx.fillStyle = this.#palette.lineColor; ctx.fill();
    const tracked = this.#visible.length && (this.#pointer !== undefined || this.#keyboardTime !== undefined)
      ? this.#visible.reduce((best, point) => {
        const distance = (value: ScreenPoint) => this.#keyboardTime !== undefined ? Math.abs(value.time - this.#keyboardTime) : Math.abs(value.x - this.#pointer!);
        return distance(point) < distance(best) ? point : best;
      }) : undefined;
    if (tracked) {
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = '#5b6b61';
      ctx.beginPath(); ctx.moveTo(tracked.x, top); ctx.lineTo(tracked.x, bottom);
      ctx.moveTo(left, tracked.y); ctx.lineTo(right, tracked.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(tracked.x, tracked.y, 4, 0, Math.PI * 2); ctx.fillStyle = this.#palette.lineColor; ctx.fill();
      ctx.strokeStyle = '#0b1210'; ctx.lineWidth = 2; ctx.stroke();
      this.#tooltip.textContent = `${this.#formatPrice.format(tracked.price)} · ${TIMESTAMP.format(tracked.time * 1000)}`;
    }
    this.#tooltip.hidden = !tracked;
    ctx.restore();
    ctx.fillStyle = '#8a9991'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const price = min + (max - min) * i / 3;
      ctx.fillText(this.#formatPrice.format(price), right + 10, y(price));
    }
    const count = width < 500 ? 2 : 4;
    const origin = this.#points[0].time;
    for (let i = 0; i <= count; i++) {
      const index = this.#range.from + (this.#range.to - this.#range.from) * i / count;
      ctx.textAlign = i === 0 ? 'left' : i === count ? 'right' : 'center';
      ctx.fillText(CLOCK.format((origin + index) * 1000), x(index), height - 10);
    }
  }

  /** Monotone cubic interpolation keeps the curve inside the sampled price extrema. */
  #trace(points: ScreenPoint[]): void {
    const ctx = this.#context;
    ctx.moveTo(points[0].x, points[0].y);
    const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.x - points[i].x));
    const tangent = (i: number) => {
      if (i === 0) return slopes[0];
      if (i === points.length - 1) return slopes.at(-1)!;
      const a = slopes[i - 1], b = slopes[i];
      return a * b <= 0 ? 0 : Math.sign(a) * Math.min(Math.abs((a + b) / 2), 3 * Math.min(Math.abs(a), Math.abs(b)));
    };
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = (b.x - a.x) / 3;
      ctx.bezierCurveTo(a.x + dx, a.y + tangent(i - 1) * dx, b.x - dx, b.y - tangent(i) * dx, b.x, b.y);
    }
  }
}
