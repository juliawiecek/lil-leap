import { HttpStatus } from '@nestjs/common';
import { AuthException } from '../../user/exceptions/auth.exception';

export class InitialDepositAboveLiquidityException extends AuthException {
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly code = 'INITIAL_DEPOSIT_ABOVE_LIQUIDITY';

  constructor(message = 'The initial deposit cannot exceed your liquidity position') {
    super(message);
  }
}
