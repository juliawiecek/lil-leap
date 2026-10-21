import { Component, input } from '@angular/core';

/** The feed's existing version key restarts this cue; no extra subscriptions or timers. */
@Component({
  selector: 'app-price-flash',
  template: `<span class="flash-cue" [class.moved]="!!direction()" aria-hidden="true">{{ direction() === 'up' ? '▲' : direction() === 'down' ? '▼' : '' }}</span><ng-content /><span class="sr-only">{{ direction() === 'up' ? 'Latest price increased' : direction() === 'down' ? 'Latest price decreased' : '' }}</span>`,
  styles: [`
    :host { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .flash-cue { display: inline-block; width: 1.1em; font-size: .8em; text-align: center; opacity: 0; }
    .flash-cue.moved { animation: price-cue 1.2s steps(1, end) forwards; }
    @keyframes price-cue { from { opacity: 1; } to { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .flash-cue.moved { animation: none; opacity: 1; } }
  `],
})
export class PriceFlash {
  readonly direction = input<'up' | 'down' | null>(null);
}
