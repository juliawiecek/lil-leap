import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { OrderHistoryClient } from './order-history-api';

/** App-wide order history client, authorised with the signed-in user's token. */
@Injectable({ providedIn: 'root' })
export class OrderHistoryService extends OrderHistoryClient {
  constructor() {
    super(inject(AuthService));
  }
}
