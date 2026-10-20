import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';

export class ProfileAccessDeniedException extends AuthException {
  readonly status = HttpStatus.FORBIDDEN;
  readonly code = 'PROFILE_ACCESS_DENIED';

  constructor() {
    super('You may only access your own profile.');
  }
}