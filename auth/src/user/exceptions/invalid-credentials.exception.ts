import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';
import { INVALID_SIGN_IN_MESSAGE } from '../../security/login-policy';

export class InvalidCredentialsException extends AuthException {
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly code = 'INVALID_CREDENTIALS';

  constructor(message = INVALID_SIGN_IN_MESSAGE) {
    super(message);
  }
}
