import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Request DTO used to authenticate an existing user. */
export class LoginRequestDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
