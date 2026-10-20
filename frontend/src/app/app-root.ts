import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ColorModeService } from './color-mode';
@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet />' })
export class AppRoot {
  /** Applies the saved color-blind setting before any page draws, sign-in included. */
  readonly colorMode = inject(ColorModeService);
}
