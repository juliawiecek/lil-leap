import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';

export class UserAlreadyExistsException extends AuthException {
  readonly status = HttpStatus.CONFLICT;
  readonly code = 'USER_ALREADY_EXISTS';

  constructor(message = 'An account with this email already exists.') {
    super(message);
  }
}
