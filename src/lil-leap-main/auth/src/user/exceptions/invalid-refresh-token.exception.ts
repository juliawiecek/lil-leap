import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';

export class InvalidRefreshTokenException extends AuthException {
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly code = 'INVALID_REFRESH_TOKEN';

  constructor(message = 'Invalid or expired refresh token.') {
    super(message);
  }
}
