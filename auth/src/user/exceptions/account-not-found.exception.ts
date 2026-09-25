import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';

export class AccountNotFoundException extends AuthException {
  readonly status = HttpStatus.NOT_FOUND;
  readonly code = 'ACCOUNT_NOT_FOUND';

  constructor(message = 'No trading account exists for this user.') {
    super(message);
  }
}
