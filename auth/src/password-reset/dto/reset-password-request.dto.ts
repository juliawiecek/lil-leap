import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsAccountPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../user/dto/password-rules';

/** Body of POST /auth/reset-password. The new password follows the same rule as registration. */
export class ResetPasswordRequestDto {
  @ApiProperty({ description: 'The token from the reset link.', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, format: 'password' })
  @IsAccountPassword()
  newPassword: string;
}
