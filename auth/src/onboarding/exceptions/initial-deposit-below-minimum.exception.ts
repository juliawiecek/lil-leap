import { HttpStatus } from '@nestjs/common';
import { AuthException } from '../../user/exceptions/auth.exception';

export class InitialDepositBelowMinimumException extends AuthException {
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly code = 'INITIAL_DEPOSIT_BELOW_MINIMUM';

  constructor(minimum = '5,000') {
    super(`The initial deposit must be at least $${minimum} for your trader tier`);
  }
}
