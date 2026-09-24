import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';

export class InvalidCredentialsException extends AuthException {
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly code = 'INVALID_CREDENTIALS';

  constructor(message = 'Invalid email or password.') {
    super(message);
  }
}
