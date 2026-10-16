import { ApiHttpClient } from '@lilleap/session-core/angular';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { CashActivityClient } from './activity-api';

/** App-wide cash-movement client, authorised with the signed-in user's token (PS-11). */
@Injectable({ providedIn: 'root' })
export class CashActivityService extends CashActivityClient {
  constructor() {
    super(inject(AuthService), inject(ApiHttpClient));
  }
}
