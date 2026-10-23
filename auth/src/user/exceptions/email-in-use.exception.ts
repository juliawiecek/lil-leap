import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';

/** Another account already uses the requested email (compared trimmed and case-insensitively). */
export class EmailInUseException extends AuthException {
  readonly status = HttpStatus.CONFLICT;
  readonly code = 'EMAIL_IN_USE';

  constructor() {
    super('That email address is already used by another account.');
  }
}
