/** Rendering boundary shared by the native canvas and fixed-time viewport. */
export interface StockChartPoint { readonly time: number; readonly value?: number; }
export interface StockChartRange { readonly from: number; readonly to: number; }
export interface StockChartPalette {
  readonly lineColor: string;
  readonly topColor: string;
  readonly bottomColor: string;
}
export interface StockChartSurface {
  setData(points: readonly StockChartPoint[]): void;
  update(point: StockChartPoint): void;
  setVisibleRange(range: StockChartRange): void;
}
