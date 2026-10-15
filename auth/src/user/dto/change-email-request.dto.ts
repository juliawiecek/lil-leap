import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeEmailRequestDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;
}