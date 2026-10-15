/*
 * TradingView Lightweight Charts™
 * Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/
 */
import type { Candle, FillMarker, Point } from './chart-data';

/** An extra line drawn over the main series, such as a moving average. */
export interface ChartOverlay {
  data: Point[];
  color: string;
}

/** A labelled horizontal line, such as the average cost. */
export interface ChartPriceLine {
  price: number;
  color: string;
  title: string;
}

/** Everything one chart shows. A new spec replaces the previous one. */
export interface ChartSpec {
  kind: 'area' | 'candles' | 'line';
  data: Candle[] | Point[];
  /** Line and area colour. */
  color?: string;
  overlays?: ChartOverlay[];
  markers?: FillMarker[];
  priceLines?: ChartPriceLine[];
  /** Fixed value range, e.g. 0-100 for RSI; otherwise the scale fits the data. */
  range?: { min: number; max: number };
  /** Identifies the time window (stock and period); the view refits when it changes. */
  key?: string;
  /** How the hover tooltip shows a line or area value: dollars (default) or a plain number, e.g. RSI. */
  valueFormat?: 'money' | 'number';
}

/** A drawn chart that can be redrawn from a new spec and removed. */
export interface ChartHandle {
  render(spec: ChartSpec): void;
  destroy(): void;
}

/** The parts of a lightweight-charts series this adapter uses. */
export interface SeriesApi {
  setData(data: readonly object[]): void;
  applyOptions(options: object): void;
  createPriceLine(options: object): unknown;
  removePriceLine(line: unknown): void;
}

/** What the crosshair reports as the pointer moves: the hovered bar's time, where the pointer is, and each series' value there. */
export interface CrosshairMove {
  time?: unknown;
  point?: { x: number; y: number };
  seriesData: Map<SeriesApi, unknown>;
}

/** The parts of a lightweight-charts chart this adapter uses. */
export interface ChartApi {
  addSeries(type: unknown, options: object): SeriesApi;
  removeSeries(series: SeriesApi): void;
  timeScale(): { fitContent(): void };
  subscribeCrosshairMove(handler: (move: CrosshairMove) => void): void;
  remove(): void;
}

/** The parts of lightweight-charts this adapter uses; passed in so tests can use a fake. */
export interface ChartLibrary {
  createChart(element: HTMLElement, options: object): ChartApi;
  createSeriesMarkers(series: SeriesApi, markers: object[]): { setMarkers(markers: object[]): void };
  AreaSeries: unknown;
  CandlestickSeries: unknown;
  LineSeries: unknown;
  LineStyle: { Dashed: unknown };
  ColorType: { Solid: unknown };
  CrosshairMode: { Normal: unknown };
}

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PRICE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAY_SECONDS = 86400;
const TOOLTIP_GAP = 12;
const TOOLTIP_STYLE = {
  position: 'absolute', zIndex: '3', pointerEvents: 'none', padding: '4px 7px', borderRadius: '4px',
  background: 'rgba(12, 20, 24, 0.92)', border: '1px solid #2b3941', color: '#e6edf3',
  fontSize: '11px', lineHeight: '1.45', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
};

/**
 * The hover tooltip's lines for one bar: its time, then open/high/low/close for candles or the
 * value for a line or area. Daily bars show the date only.
 */
export function tooltipLines(
  kind: ChartSpec['kind'], value: Candle | Point, time: number, valueFormat: ChartSpec['valueFormat'] = 'money', locale?: string,
): string[] {
  const daily = time % DAY_SECONDS === 0;
  const when = new Intl.DateTimeFormat(locale, daily
    ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(time * 1000);
  if (kind === 'candles' && 'open' in value) {
    return [when, `O ${PRICE.format(value.open)}  H ${PRICE.format(value.high)}`, `L ${PRICE.format(value.low)}  C ${PRICE.format(value.close)}`];
  }
  const amount = (value as Point).value;
  return [when, valueFormat === 'number' ? PRICE.format(amount) : MONEY.format(amount)];
}

/** Shows a small box by the pointer with the hovered bar's values; hidden off the data. Needs a real page. */
function attachTooltip(
  chart: ChartApi, element: HTMLElement, current: () => { spec: ChartSpec | null; series: SeriesApi | null },
): void {
  const page = element.ownerDocument;
  if (!page) {
    return;
  }
  const box = page.createElement('div');
  box.className = 'chart-tooltip';
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, TOOLTIP_STYLE, { display: 'none' });
  element.style.position ||= 'relative';
  element.appendChild(box);
  chart.subscribeCrosshairMove((move) => {
    const { spec, series } = current();
    const value = series ? (move.seriesData.get(series) as Candle | Point | undefined) : undefined;
    if (!spec || !move.point || typeof move.time !== 'number' || !value) {
      box.style.display = 'none';
      return;
    }
    box.replaceChildren(...tooltipLines(spec.kind, value, move.time, spec.valueFormat).map((line) => {
      const row = page.createElement('div');
      row.textContent = line;
      return row;
    }));
    box.style.display = 'block';
    const fitsRight = move.point.x + TOOLTIP_GAP + box.offsetWidth <= element.clientWidth;
    const left = fitsRight ? move.point.x + TOOLTIP_GAP : move.point.x - TOOLTIP_GAP - box.offsetWidth;
    box.style.left = `${Math.max(0, left)}px`;
    box.style.top = `${Math.max(0, move.point.y - box.offsetHeight - TOOLTIP_GAP)}px`;
  });
}

export const UP_COLOR = '#26b775';
export const DOWN_COLOR = '#ee535d';
export const AREA_COLOR = '#8bdd88';

const CHART_OPTIONS = (lib: ChartLibrary) => ({
  autoSize: true,
  layout: {
    background: { type: lib.ColorType.Solid, color: 'transparent' },
    textColor: '#aebaca',
    fontSize: 11,
    // The licence's link to tradingview.com is in the sign-in footer (app.html), so the logo is off.
    attributionLogo: false,
  },
  grid: { vertLines: { color: 'rgba(120, 140, 155, 0.10)' }, horzLines: { color: 'rgba(120, 140, 155, 0.10)' } },
  crosshair: { mode: lib.CrosshairMode.Normal },
  rightPriceScale: { borderVisible: false },
  timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4 },
});

function seriesFor(lib: ChartLibrary, spec: ChartSpec): [unknown, object] {
  const color = spec.color ?? AREA_COLOR;
  switch (spec.kind) {
    case 'candles':
      return [lib.CandlestickSeries, {
        upColor: UP_COLOR, downColor: DOWN_COLOR, wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR, borderVisible: false,
      }];
    case 'area':
      return [lib.AreaSeries, { lineColor: color, topColor: `${color}44`, bottomColor: `${color}05`, lineWidth: 2 }];
    default:
      return [lib.LineSeries, { color, lineWidth: 1.5 }];
  }
}

/**
 * Draws a {@link ChartSpec} with lightweight-charts. The main series is rebuilt only when its
 * kind changes, so live updates keep the user's zoom; the view refits when a new time window
 * (period or stock) is loaded.
 */
export function createLightweightChart(lib: ChartLibrary, element: HTMLElement): ChartHandle {
  const chart = lib.createChart(element, CHART_OPTIONS(lib));
  let kind: ChartSpec['kind'] | null = null;
  let main: SeriesApi | null = null;
  let markers: { setMarkers(markers: object[]): void } | null = null;
  let overlays: SeriesApi[] = [];
  let priceLines: unknown[] = [];
  let windowKey: string | undefined | null = null;
  let shown: ChartSpec | null = null;
  attachTooltip(chart, element, () => ({ spec: shown, series: main }));

  return {
    render(spec: ChartSpec): void {
      shown = spec;
      if (spec.kind !== kind) {
        if (main) {
          chart.removeSeries(main);
        }
        const [type, options] = seriesFor(lib, spec);
        main = chart.addSeries(type, options);
        markers = lib.createSeriesMarkers(main, []);
        priceLines = [];
        kind = spec.kind;
        windowKey = null;
      }
      const series = main!;
      series.applyOptions({
        autoscaleInfoProvider: spec.range
          ? () => ({ priceRange: { minValue: spec.range!.min, maxValue: spec.range!.max } })
          : undefined,
      });
      series.setData(spec.data);

      overlays.forEach((line) => chart.removeSeries(line));
      overlays = (spec.overlays ?? []).map((overlay) => {
        const line = chart.addSeries(lib.LineSeries, {
          color: overlay.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        line.setData(overlay.data);
        return line;
      });

      markers!.setMarkers(spec.markers ?? []);

      priceLines.forEach((line) => series.removePriceLine(line));
      priceLines = (spec.priceLines ?? []).map((line) => series.createPriceLine({
        price: line.price, color: line.color, title: line.title, lineWidth: 1, lineStyle: lib.LineStyle.Dashed, axisLabelVisible: true,
      }));

      if (spec.key !== windowKey) {
        chart.timeScale().fitContent();
        windowKey = spec.key;
      }
    },
    destroy(): void {
      chart.remove();
    },
  };
}
