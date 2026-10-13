import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet />' })
export class Shell {
  private readonly auth = inject(AuthService);
  @HostListener('document:pointerdown')
  @HostListener('document:keydown')
  @HostListener('document:wheel')
  @HostListener('document:touchstart')
  recordActivity(): void { this.auth.session.recordActivity(); }
}
