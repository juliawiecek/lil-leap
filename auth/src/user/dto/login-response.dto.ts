import { UserResponseDto } from './user-response.dto';

/** Response DTO returned after a successful login. */
export class LoginResponseDto {
  constructor(
    public accessToken: string,
    public refreshToken: string,
    public user: UserResponseDto,
  ) {}
}
