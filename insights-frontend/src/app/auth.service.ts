import { Injectable } from '@angular/core';
import { AuthClient } from './auth-api';
@Injectable({ providedIn: 'root' })
export class AuthService extends AuthClient {
  constructor() { super(undefined, '/auth', { storageKey: 'nexttrade-insights.auth.session.v1' }); }
}
