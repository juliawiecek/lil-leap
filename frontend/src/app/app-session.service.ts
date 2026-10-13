import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionCoordinator } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { safeReturnUrl } from './page-state';
@Injectable({ providedIn: 'root' })
export class AppSessionService extends SessionCoordinator implements OnDestroy {
  constructor() {
    super(inject(AuthService), inject(Router, { optional: true }), 'TRADER', safeReturnUrl);
  }
  ngOnDestroy(): void {
    this.destroy();
  }
}
