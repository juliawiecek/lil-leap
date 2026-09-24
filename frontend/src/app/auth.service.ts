import { Injectable } from '@angular/core';
import { AuthClient } from './auth-api';

/** App-wide auth client; one instance holds the signed-in user's tokens. */
@Injectable({ providedIn: 'root' })
export class AuthService extends AuthClient {
  constructor() {
    super();
  }
}
