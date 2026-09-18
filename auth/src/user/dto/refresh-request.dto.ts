import { IsNotEmpty, IsString } from 'class-validator';

/** Request DTO used to exchange a refresh token for a new access token. */
export class RefreshRequestDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
