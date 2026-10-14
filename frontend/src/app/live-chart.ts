import { Component, DestroyRef, ElementRef, InjectionToken, effect, inject, input, viewChild } from '@angular/core';
import * as lightweightCharts from 'lightweight-charts';
import { type ChartHandle, type ChartLibrary, type ChartSpec, createLightweightChart } from './lightweight-chart';

/** Creates the drawn chart inside an element; tests replace it with a fake. */
export type ChartFactory = (element: HTMLElement) => ChartHandle;

export const CHART_FACTORY = new InjectionToken<ChartFactory>('CHART_FACTORY', {
  providedIn: 'root',
  factory: () => (element) => createLightweightChart(lightweightCharts as unknown as ChartLibrary, element),
});

/** A live price or value chart: pass a new spec whenever the data changes. */
@Component({
  selector: 'app-live-chart',
  template: `<div #host class="live-chart" role="img" [attr.aria-label]="label()"></div>`,
  styles: [':host { display: block; } .live-chart { width: 100%; height: 100%; }'],
})
export class LiveChart {
  readonly spec = input.required<ChartSpec>();
  readonly label = input('Price chart');

  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  private readonly createChart = inject(CHART_FACTORY);
  private handle: ChartHandle | null = null;

  constructor() {
    effect(() => {
      const element = this.host()?.nativeElement;
      const spec = this.spec();
      if (!element) {
        return;
      }
      this.handle ??= this.createChart(element);
      this.handle.render(spec);
    });
    inject(DestroyRef).onDestroy(() => this.handle?.destroy());
  }
}
