import { IsNotEmpty, IsString } from 'class-validator';

/** Request DTO used to authenticate an existing user. */
export class LoginRequestDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
