import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';
import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILURES } from '../../security/login-policy';

/**
 * The current password sent to change an email or password was wrong, or the account is locked.
 * Counts toward the same sign-in lockout (BR-03), so a stolen access token can't be used to guess it.
 */
export class IncorrectPasswordException extends AuthException {
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly code = 'INCORRECT_PASSWORD';

  constructor() {
    super(
      `Your current password is incorrect, or the account is locked. After ${LOGIN_MAX_FAILURES} failed attempts, ` +
        `wait ${LOGIN_LOCK_MINUTES} minutes and try again.`,
    );
  }
}
