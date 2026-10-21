import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  PLATFORM_ID,
  inject,
  input,
  signal,
  viewChild,
  type AfterViewInit,
  type OnChanges,
  type OnDestroy,
} from '@angular/core';
import type { StockPriceTick } from './stock-price-ticks';
import {
  chartBox,
  chartPaths,
  validPrice,
  lowerBound,
  mapX,
  mapY,
  nearestPoint,
  reducePoints,
  visiblePoints,
  EMERALD_AREA,
  type ChartBox,
  type ChartRange,
} from './stock-chart-math';
import { StockChartViewport } from './stock-chart-viewport';

let nextChartId = 0;
const CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
});
const TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

@Component({
  selector: 'app-stock-svg-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      #svg
      width="100%"
      height="100%"
      tabindex="0"
      role="img"
      [attr.data-performance]="performance()"
      [attr.aria-label]="label() + '. ' + performanceText() + '. Use arrow keys to explore prices; Escape to return to live.'"
    >
      <defs>
        <linearGradient
          [id]="gradientId"
          gradientUnits="userSpaceOnUse"
          x1="0"
          x2="0"
          y1="28"
          y2="290"
        >
          <stop offset="0%" [attr.stop-color]="palette.top" />
          <stop offset="100%" [attr.stop-color]="palette.bottom" />
        </linearGradient>
        <clipPath [id]="clipId"><rect data-clip /></clipPath>
      </defs>
      <g [attr.clip-path]="'url(#' + clipId + ')'">
        <path data-area [attr.fill]="'url(#' + gradientId + ')'" />
        <path
          data-line
          fill="none"
          [attr.stroke]="palette.line"
          stroke-width="2"
          style="stroke-dasharray: var(--series-dash)"
          vector-effect="non-scaling-stroke"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle data-latest r="3" [attr.fill]="palette.line" visibility="hidden" />
      </g>
      <g data-selection visibility="hidden" aria-hidden="true">
        <path
          data-crosshair
          fill="none"
          stroke="var(--text-tone-65)"
          stroke-opacity=".5"
          stroke-width="1"
          stroke-dasharray="3 5"
        />
        <circle data-marker r="4" [attr.fill]="palette.line" stroke="var(--surface-tone-102)" stroke-width="2" />
      </g>
      <g class="axis" aria-hidden="true">
        <text data-price="0" />
        <text data-price="1" />
        <text data-time="0" />
        <text data-time="1" />
        <text data-time="2" />
      </g>
    </svg>
    <div #tooltip class="tooltip" role="status" aria-live="off" hidden></div>
    @if (empty()) {
      <p class="empty" role="status">{{ emptyLabel() }}</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 180px;
        min-width: 0;
      }
      svg {
        display: block;
        overflow: hidden;
        touch-action: pan-y;
        outline-offset: -3px;
      }
      .axis {
        fill: var(--text-tone-65);
        font:
          10px Inter,
          ui-sans-serif,
          system-ui;
        font-variant-numeric: tabular-nums;
      }
      .tooltip {
        position: absolute;
        top: 4px;
        left: 16px;
        max-width: calc(100% - 32px);
        padding: 7px 10px;
        border: 1px solid var(--surface-tone-104);
        border-radius: 8px;
        background: var(--surface-tone-103);
        color: var(--text-tone-66);
        font:
          12px Inter,
          ui-sans-serif,
          system-ui;
        pointer-events: none;
      }
      .empty {
        position: absolute;
        inset: 40% 16px auto;
        text-align: center;
        color: var(--text-tone-65);
        font:
          13px Inter,
          ui-sans-serif,
          system-ui;
      }
    `,
  ],
})
export class StockSvgChart implements AfterViewInit, OnChanges, OnDestroy {
  readonly windowSeconds = input(86400);
  readonly label = input('One-day stock price');
  readonly emptyLabel = input('No prices available yet');
  readonly palette = EMERALD_AREA;
  readonly empty = signal(true);
  readonly performance = signal<'gain' | 'loss' | 'neutral'>('neutral');
  readonly performanceText = signal('Session comparison unavailable');
  readonly gradientId = `stock-gradient-${++nextChartId}`;
  readonly clipId = `stock-clip-${nextChartId}`;
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly tooltip = viewChild.required<ElementRef<HTMLDivElement>>('tooltip');
  readonly #zone = inject(NgZone);
  readonly #platform = inject(PLATFORM_ID);
  #viewport: StockChartViewport | undefined;
  #observer: ResizeObserver | undefined;
  #events: AbortController | undefined;
  #motion: MediaQueryList | undefined;
  #nodes = new Map<string, SVGElement>();
  #points: readonly StockPriceTick[] = [];
  #range: ChartRange | undefined;
  #box: ChartBox = chartBox(600, 320);
  #selection: StockPriceTick | undefined;
  #currency = 'USD';
  #format = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  #resizeFrame: number | undefined;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.#platform)) {
      return;
    }
    this.#zone.runOutsideAngular(() => {
      const svg = this.svg().nativeElement;
      for (const name of ['area', 'line', 'clip', 'latest', 'selection', 'crosshair', 'marker']) {
        this.#nodes.set(name, svg.querySelector(`[data-${name}]`)!);
      }
      this.#motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.#viewport = new StockChartViewport(
        (points, range) => this.#draw(points, range),
        this.windowSeconds(),
        () => this.#motion?.matches ?? false,
      );
      this.#events = new AbortController();
      const signal = this.#events.signal;
      this.#motion.addEventListener(
        'change',
        () => {
          if (this.#motion?.matches) {
            this.#viewport?.finishAnimation();
          }
        },
        { signal },
      );
      svg.addEventListener('pointermove', (event) => this.#selectAt(event.clientX), { signal });
      svg.addEventListener(
        'pointerdown',
        (event) => {
          if (event.pointerType !== 'mouse') {
            svg.setPointerCapture?.(event.pointerId);
          }
          this.#selectAt(event.clientX);
        },
        { signal },
      );
      for (const type of ['pointerleave', 'pointercancel', 'pointerup', 'blur']) {
        svg.addEventListener(type, () => this.#clearSelection(), { signal });
      }
      svg.addEventListener('keydown', (event) => this.#keyboard(event), { signal });
      this.#observer = new window.ResizeObserver(() => {
        if (this.#resizeFrame !== undefined) {
          return;
        }
        this.#resizeFrame = requestAnimationFrame(() => {
          this.#resizeFrame = undefined;
          this.#viewport?.refresh();
        });
      });
      this.#observer.observe(svg);
    });
  }
  ngOnChanges(): void {
    this.#zone.runOutsideAngular(() => this.#viewport?.setWindowSeconds(this.windowSeconds()));
  }
  setHistory(points: readonly StockPriceTick[]): void {
    this.#clearSelection();
    this.#viewport?.setHistory(points);
    const hasPrices = points.some(validPrice);
    this.empty.set(!hasPrices);
    if (!hasPrices) {
      this.#points = [];
      this.#range = undefined;
      this.#nodes.get('line')?.setAttribute('d', '');
      this.#nodes.get('area')?.setAttribute('d', '');
      this.#nodes.get('latest')?.setAttribute('visibility', 'hidden');
      this.svg()
        .nativeElement.querySelectorAll('text')
        .forEach((node) => (node.textContent = ''));
    }
  }
  append(point: StockPriceTick): void {
    this.#viewport?.append(point);
  }
  /** Safe palettes add a loss colour/dash; Off retains the existing emerald area style. */
  setPerformance(price: number, open: number | null, currency = 'USD'): void {
    const known = open !== null && Number.isFinite(open) && open > 0;
    this.performance.set(known ? (price < open ? 'loss' : 'gain') : 'neutral');
    this.performanceText.set(known ? (price < open ? 'Below session open' : 'At or above session open') : 'Session comparison unavailable');
    if (currency !== this.#currency) {
      this.#currency = currency;
      this.#format = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    }
  }
  ngOnDestroy(): void {
    this.#viewport?.destroy();
    this.#observer?.disconnect();
    this.#events?.abort();
    if (this.#resizeFrame !== undefined) {
      cancelAnimationFrame(this.#resizeFrame);
    }
  }
  #attr(name: string, attrs: Record<string, string | number>): void {
    const node = this.#nodes.get(name)!;
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
  }
  #draw(points: readonly StockPriceTick[], range: ChartRange): void {
    // Freeze the inspection copy as well as the viewport; live updates remain buffered.
    this.#points = [...points];
    this.#range = range;
    if (this.empty()) {
      this.empty.set(false);
    }
    const svg = this.svg().nativeElement,
      { width, height } = svg.getBoundingClientRect();
    if (width < 1 || height < 1) {
      return;
    }
    const box = (this.#box = chartBox(width, height));
    const visible = visiblePoints(points, range.from, range.to);
    const paths = chartPaths(reducePoints(visible, range, (box.right - box.left) / 2), range, box);
    this.#attr('line', { d: paths.line });
    this.#attr('area', { d: paths.area });
    this.#attr('clip', {
      x: box.left,
      y: box.top,
      width: Math.max(0, Math.min(box.right, mapX(range.reveal, range, box) + 4) - box.left),
      height: box.bottom - box.top,
    });
    const gradient = svg.querySelector('linearGradient')!;
    gradient.setAttribute('y1', String(box.top));
    gradient.setAttribute('y2', String(box.bottom));
    const last = points.at(-1);
    if (last) {
      this.#attr('latest', {
        cx: mapX(last.time, range, box),
        cy: mapY(last.price, range, box),
        visibility: last.time <= range.reveal ? 'visible' : 'hidden',
      });
    }
    svg.querySelectorAll<SVGTextElement>('[data-time]').forEach((node, index) => {
      const time = range.from + ((range.to - range.from) * index) / 2;
      node.setAttribute('x', String(mapX(time, range, box)));
      node.setAttribute('y', String(height - 9));
      node.setAttribute('text-anchor', index === 0 ? 'start' : index === 2 ? 'end' : 'middle');
      node.textContent = CLOCK.format(time * 1000);
    });
    svg.querySelectorAll<SVGTextElement>('[data-price]').forEach((node, index) => {
      node.setAttribute('x', String(box.right));
      node.setAttribute('y', String(index ? box.bottom - 5 : box.top - 10));
      node.setAttribute('text-anchor', 'end');
      node.textContent = this.#format.format(index ? range.min : range.max);
    });
    if (this.#selection) {
      this.#showSelection(this.#selection);
    }
  }
  #inspectable(): readonly StockPriceTick[] {
    const range = this.#range;
    return range
      ? this.#points.slice(
          lowerBound(this.#points, range.from),
          lowerBound(this.#points, Math.min(range.to, range.reveal) + 0.0001),
        )
      : [];
  }
  #selectAt(clientX: number): void {
    if (!this.#range) {
      return;
    }
    const box = this.#box;
    const x = Math.max(
      box.left,
      Math.min(box.right, clientX - this.svg().nativeElement.getBoundingClientRect().left),
    );
    const time =
      this.#range.from +
      ((x - box.left) / (box.right - box.left)) * (this.#range.to - this.#range.from);
    const point = nearestPoint(this.#inspectable(), time);
    if (!point) {
      return;
    }
    this.#viewport?.pause();
    this.#showSelection(point);
  }
  #showSelection(point: StockPriceTick): void {
    if (!this.#range) {
      return;
    }
    this.#selection = point;
    const box = this.#box,
      x = mapX(point.time, this.#range, box),
      y = mapY(point.price, this.#range, box);
    this.#attr('selection', { visibility: 'visible' });
    this.#attr('marker', { cx: x, cy: y });
    this.#attr('crosshair', { d: `M${x},${box.top} V${box.bottom}` });
    const tooltip = this.tooltip().nativeElement;
    tooltip.hidden = false;
    tooltip.textContent = `${this.#format.format(point.price)} · ${TIME.format(point.time * 1000)}`;
  }
  #clearSelection(): void {
    this.#selection = undefined;
    this.#nodes.get('selection')?.setAttribute('visibility', 'hidden');
    this.tooltip().nativeElement.hidden = true;
    this.tooltip().nativeElement.setAttribute('aria-live', 'off');
    this.#viewport?.resume();
  }
  #keyboard(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.#clearSelection();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const points = this.#inspectable();
    if (!points.length) {
      return;
    }
    event.preventDefault();
    this.#viewport?.pause();
    let index = this.#selection ? lowerBound(points, this.#selection.time) : points.length - 1;
    index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? points.length - 1
          : Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
    this.tooltip().nativeElement.setAttribute('aria-live', 'polite');
    this.#showSelection(points[index]);
  }
}
