import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Request DTO used to exchange a refresh token for a new access token. */
export class RefreshRequestDto {
  @ApiProperty({ description: 'The opaque refresh token from the last login or refresh.' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
