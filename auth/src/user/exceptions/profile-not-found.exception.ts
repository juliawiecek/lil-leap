import { HttpStatus } from '@nestjs/common';
import { AuthException } from './auth.exception';

export class ProfileNotFoundException extends AuthException {
  readonly status = HttpStatus.NOT_FOUND;
  readonly code = 'PROFILE_NOT_FOUND';

  constructor() {
    super('No profile exists for this user.');
  }
}