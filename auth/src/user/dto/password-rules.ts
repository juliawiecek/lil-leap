import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** The one password rule, shared by registration and password reset so the two can't drift apart. */
export function IsAccountPassword(): PropertyDecorator {
  return applyDecorators(IsString(), MinLength(PASSWORD_MIN_LENGTH), MaxLength(PASSWORD_MAX_LENGTH));
}
