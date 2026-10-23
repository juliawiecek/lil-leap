import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsAccountPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../user/dto/password-rules';

/** Body of POST /auth/me/password. The new password follows the same rule as registration. */
export class ChangePasswordRequestDto {
  @ApiProperty({ format: 'password', maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, format: 'password' })
  @IsAccountPassword()
  newPassword: string;
}
