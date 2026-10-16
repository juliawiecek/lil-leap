import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO returned after a successful token refresh.
 *
 * The refresh token is rotated on every use: the token in this response
 * replaces the one the caller sent, which is invalidated immediately.
 */
export class RefreshResponseDto {
  @ApiProperty({ description: 'New access token, with the same claims as at login.' })
  accessToken: string;

  @ApiProperty({ description: 'Replacement refresh token; the one sent is now invalid.' })
  refreshToken: string;

  constructor(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
}
