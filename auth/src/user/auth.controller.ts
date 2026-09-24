import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RegistrationService } from '../onboarding/registration.service';
import { TierService } from '../onboarding/tier.service';
import { UserService } from './user.service';
import { JwtService } from '../security/jwt.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { RegisterRequestDto } from './dto/register-request.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import { UserResponseDto } from './dto/user-response.dto';

/** Auth REST surface: register, login, refresh, logout. One endpoint per operation for both roles. */
@Controller()
export class AuthController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly tierService: TierService,
  ) {}

  /** Creates the account; does not issue tokens -- signing in is a separate step. */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() request: RegisterRequestDto): Promise<UserResponseDto> {
    const user = await this.registrationService.register(request);
    return UserResponseDto.from(user);
  }

  /**
   * Issues an access + refresh token pair. The access token carries the account's trader_level,
   * read from the accounts table. Bad credentials get a generic 401 -- see GlobalExceptionFilter.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() request: LoginRequestDto): Promise<LoginResponseDto> {
    const user = await this.userService.login(request);
    const traderLevel = await this.tierService.findTraderLevel(user.userId);
    const accessToken = this.jwtService.issueToken(user.userId, user.email, traderLevel);
    const refreshToken = await this.refreshTokenService.issue(user);

    return new LoginResponseDto(accessToken, refreshToken, UserResponseDto.from(user));
  }

  /** Exchanges a refresh token for a new access token; the old refresh token is invalidated either way. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() request: RefreshRequestDto): Promise<RefreshResponseDto> {
    const rotation = await this.refreshTokenService.rotate(request.refreshToken);
    // Re-read rather than copied from the old token, so a tier change shows up on the next refresh.
    const traderLevel = await this.tierService.findTraderLevel(rotation.user.userId);
    const accessToken = this.jwtService.issueToken(rotation.user.userId, rotation.user.email, traderLevel);

    return new RefreshResponseDto(accessToken, rotation.newRawRefreshToken);
  }

  /**
   * Revokes the refresh token so it can't mint new access tokens. Always 204, even for an
   * unknown or already-revoked token -- the caller is logged out either way, and the response
   * doesn't reveal whether the token was valid. Already-issued access tokens stay valid until
   * they expire (APP_JWT_EXPIRATION_MINUTES); they're verified statelessly downstream.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() request: RefreshRequestDto): Promise<void> {
    await this.refreshTokenService.revoke(request.refreshToken);
  }
}
