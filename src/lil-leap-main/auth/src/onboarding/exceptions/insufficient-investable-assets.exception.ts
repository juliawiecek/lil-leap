import { HttpStatus } from '@nestjs/common';
import { AuthException } from '../../user/exceptions/auth.exception';

export class InsufficientInvestableAssetsException extends AuthException {
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly code = 'INSUFFICIENT_INVESTABLE_ASSETS';

  constructor(message = 'A minimum of $5,000 in investable assets is required') {
    super(message);
  }
}
