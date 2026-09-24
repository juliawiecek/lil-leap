import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';

export class InvalidAccessTokenException extends AuthException {
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly code = 'INVALID_ACCESS_TOKEN';

  constructor(message = 'A valid access token is required.') {
    super(message);
  }
}
