/**
 * Response DTO returned after a successful token refresh.
 *
 * The refresh token is rotated on every use: the token in this response
 * replaces the one the caller sent, which is invalidated immediately.
 */
export class RefreshResponseDto {
  constructor(
    public accessToken: string,
    public refreshToken: string,
  ) {}
}
