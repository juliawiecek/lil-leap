import { IsAccountPassword } from './password-rules';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

  @IsAccountPassword()
  newPassword: string;
}