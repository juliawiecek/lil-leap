import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';
import { PASSWORD_EXPIRED_MESSAGE } from '../../security/password-policy';

/**
 * The password was correct but older than the policy allows (BR-03). Only a caller who knows the
 * password reaches this, so saying so discloses nothing an attacker lacks. The user id and email ride
 * along for the controller, which emails a reset link; the response body carries only code and message.
 */
export class PasswordExpiredException extends AuthException {
  readonly status = HttpStatus.FORBIDDEN;
  readonly code = 'PASSWORD_EXPIRED';

  constructor(readonly userId: string, readonly email: string, message = PASSWORD_EXPIRED_MESSAGE) {
    super(message);
  }
}
