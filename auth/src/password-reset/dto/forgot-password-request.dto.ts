import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

/** Body of POST /auth/forgot-password. */
export class ForgotPasswordRequestDto {
  @ApiProperty({ example: 'ada@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email: string;
}
