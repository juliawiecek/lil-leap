import type { StockPriceTick } from './stock-price-ticks';

export interface ChartRange {
  from: number;
  to: number;
  min: number;
  max: number;
  reveal: number;
}
export interface ChartBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface ChartPalette {
  line: string;
  top: string;
}
/** Rendering style is independent of the portfolio/quote performance indicators. */
export const EMERALD_AREA = {
  line: '#22c55e',
  top: 'rgba(34, 197, 94, 0.4)',
  bottom: 'rgba(34, 197, 94, 0.0)',
} as const;
export const UP: ChartPalette = { line: '#22c55e', top: 'rgba(34, 197, 94, 0.3)' };
export const DOWN: ChartPalette = { line: '#ef4444', top: 'rgba(239, 68, 68, 0.3)' };
export const UNKNOWN: ChartPalette = { line: '#94a3b8', top: 'rgba(148, 163, 184, 0.12)' };
export function performancePalette(price: number, open: number | null): ChartPalette {
  return open === null || !Number.isFinite(open) || open <= 0 ? UNKNOWN : price >= open ? UP : DOWN;
}
export function validPrice(point: StockPriceTick): boolean {
  return (
    Number.isFinite(point.time) &&
    point.time >= 0 &&
    Number.isFinite(point.price) &&
    point.price > 0
  );
}
/** Deduplicate timestamps (last observation wins), without editing caller-owned history. */
export function normalizeHistory(points: readonly StockPriceTick[]): StockPriceTick[] {
  return [
    ...new Map(points.filter(validPrice).map((point) => [point.time, { ...point }])).values(),
  ].sort((a, b) => a.time - b.time);
}
export function chartBox(width: number, height: number): ChartBox {
  return { left: 16, right: Math.max(17, width - 18), top: 28, bottom: Math.max(29, height - 30) };
}
export function mapX(time: number, range: ChartRange, box: ChartBox): number {
  return box.left + ((time - range.from) / (range.to - range.from)) * (box.right - box.left);
}
export function mapY(price: number, range: ChartRange, box: ChartBox): number {
  return box.bottom - ((price - range.min) / (range.max - range.min)) * (box.bottom - box.top);
}
export function priceDomain(points: readonly StockPriceTick[]): { min: number; max: number } {
  let min = Infinity,
    max = -Infinity;
  for (const point of points) {
    min = Math.min(min, point.price);
    max = Math.max(max, point.price);
  }
  if (!points.length) return { min: 0, max: 1 };
  const padding = Math.max((max - min) * 0.16, max * 0.0005, 0.01);
  return { min: min - padding, max: max + padding };
}
/** Retain boundary neighbours so the connected line clips correctly across gaps. */
export function visiblePoints(
  points: readonly StockPriceTick[],
  from: number,
  to: number,
): readonly StockPriceTick[] {
  if (!points.length) return [];
  const start = lowerBound(points, from),
    end = lowerBound(points, to);
  return points.slice(Math.max(0, start - 1), Math.min(points.length, end + 1));
}
export function lowerBound(points: readonly StockPriceTick[], time: number): number {
  let low = 0,
    high = points.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (points[mid].time < time) low = mid + 1;
    else high = mid;
  }
  return low;
}
export function nearestPoint(
  points: readonly StockPriceTick[],
  time: number,
): StockPriceTick | undefined {
  const index = lowerBound(points, time);
  const before = points[Math.max(0, index - 1)],
    after = points[Math.min(points.length - 1, index)];
  return !before || !after
    ? undefined
    : Math.abs(before.time - time) <= Math.abs(after.time - time)
      ? before
      : after;
}
/** Pixel buckets retain first/last/min/max in time order. Only the display copy is reduced. */
export function reducePoints(
  points: readonly StockPriceTick[],
  range: ChartRange,
  columns: number,
): readonly StockPriceTick[] {
  const buckets = Math.max(1, Math.floor(columns));
  if (points.length <= buckets * 4) return points;
  const result: StockPriceTick[] = [];
  let group: StockPriceTick[] = [],
    previous = -Infinity;
  const flush = () => {
    if (!group.length) return;
    let low = group[0],
      high = group[0];
    for (const point of group) {
      if (point.price < low.price) low = point;
      if (point.price > high.price) high = point;
    }
    result.push(
      ...[...new Set([group[0], low, high, group[group.length - 1]])].sort(
        (a, b) => a.time - b.time,
      ),
    );
    group = [];
  };
  for (const point of points) {
    const bucket = Math.floor(((point.time - range.from) / (range.to - range.from)) * buckets);
    if (bucket !== previous) {
      flush();
      previous = bucket;
    }
    group.push(point);
  }
  flush();
  return result;
}
export function chartPaths(
  points: readonly StockPriceTick[],
  range: ChartRange,
  box: ChartBox,
): { line: string; area: string } {
  if (!points.length) return { line: '', area: '' };
  const coord = (value: number) => Number(value.toFixed(3));
  const line = smoothPricePath(
    points.map((point) => ({ x: mapX(point.time, range, box), y: mapY(point.price, range, box) })),
  );
  return {
    line,
    area: `${line} L${coord(mapX(points[points.length - 1].time, range, box))},${box.bottom} L${coord(mapX(points[0].time, range, box))},${box.bottom} Z`,
  };
}

/** Monotone cubics pass through real observations. Every control stays inside its segment's price bounds. */
export function smoothPricePath(points: readonly { x: number; y: number }[]): string {
  if (!points.length) return '';
  const coord = (value: number) => Number(value.toFixed(3));
  const slopes = points
    .slice(1)
    .map((point, index) => (point.y - points[index].y) / (point.x - points[index].x));
  const tangent = (index: number): number => {
    if (index === 0) return slopes[0] ?? 0;
    if (index === points.length - 1) return slopes[index - 1];
    const a = slopes[index - 1],
      b = slopes[index];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  let path = `M${coord(points[0].x)},${coord(points[0].y)}`;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index],
      dx = (b.x - a.x) / 3;
    if (dx <= 0) {
      path += ` L${coord(b.x)},${coord(b.y)}`;
      continue;
    }
    const clamp = (y: number) => Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), y));
    path +=
      ` C${coord(a.x + dx)},${coord(clamp(a.y + tangent(index - 1) * dx))}` +
      ` ${coord(b.x - dx)},${coord(clamp(b.y - tangent(index) * dx))} ${coord(b.x)},${coord(b.y)}`;
  }
  return path;
}
