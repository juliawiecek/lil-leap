import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

/** Response DTO returned after a successful login. */
export class LoginResponseDto {
  @ApiProperty({
    description:
      'HS256 JWT. Claims: sub (user id), email, client_id, and trader_level (NOVICE | ADVANCED) for users with a trading account.',
  })
  accessToken: string;

  @ApiProperty({ description: 'Opaque refresh token; send it to /auth/refresh or /auth/logout.' })
  refreshToken: string;

  @ApiProperty({ type: () => UserResponseDto })
  user: UserResponseDto;

  constructor(accessToken: string, refreshToken: string, user: UserResponseDto) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.user = user;
  }
}
