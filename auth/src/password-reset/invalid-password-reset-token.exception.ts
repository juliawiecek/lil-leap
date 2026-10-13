import { HttpStatus } from '@nestjs/common';
import { AuthException } from '../user/exceptions/auth.exception';

/** One response for unknown, expired and already-used tokens, so a caller can't tell them apart. */
export class InvalidPasswordResetTokenException extends AuthException {
  readonly status = HttpStatus.BAD_REQUEST;
  readonly code = 'INVALID_RESET_TOKEN';

  constructor(message = 'This password reset link is invalid or has expired.') {
    super(message);
  }
}
