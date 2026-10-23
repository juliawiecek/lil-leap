import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { AccessTokenGuard, AuthenticatedRequest } from '../security/access-token.guard';
import { JwtService } from '../security/jwt.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { TierService } from '../onboarding/tier.service';
import { UserProfileResponseDto } from '../user/dto/user-profile-response.dto';
import { UserResponseDto } from '../user/dto/user-response.dto';
import { RefreshResponseDto } from '../user/dto/refresh-response.dto';
import { AccountSettingsService } from './account-settings.service';
import { UpdateProfileRequestDto } from './dto/update-profile-request.dto';
import { ChangeEmailRequestDto } from './dto/change-email-request.dto';
import { ChangePasswordRequestDto } from './dto/change-password-request.dto';

const TOKEN_401 = 'INVALID_ACCESS_TOKEN: missing, invalid or expired Bearer token.';
const PASSWORD_401 =
  'INCORRECT_PASSWORD: the current password is wrong or the account is locked. Counts toward the 3-failure sign-in lockout. Nothing is changed.';

/**
 * Account settings (PS-07). Every route acts on the caller named by the access token (BR-02) --
 * there is no user id in the path, so one user can never change another's details.
 */
@ApiTags('account settings')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('me')
export class AccountSettingsController {
  constructor(
    private readonly settings: AccountSettingsService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly tierService: TierService,
  ) {}

  /** Internal consumers and clients can check a token without revealing account data. */
  @Get('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Check whether the bearer token belongs to an active session' })
  @ApiNoContentResponse({ description: 'The token is valid and its session is active.' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: TOKEN_401 })
  session(): void {}

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change your address and/or phone number', description: 'Send only the fields that change. Writes PROFILE_UPDATED to audit_log.' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'INVALID_REQUEST: neither field sent, a blank address, or a malformed phone number.' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: TOKEN_401 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'PROFILE_NOT_FOUND: the caller has no contact profile (staff accounts).' })
  async updateProfile(@Req() request: AuthenticatedRequest, @Body() body: UpdateProfileRequestDto): Promise<UserProfileResponseDto> {
    return UserProfileResponseDto.from(await this.settings.updateProfile(request.userId, body));
  }

  @Post('email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change your sign-in email',
    description:
      'Requires the current password. The new email must not belong to another account. Notices go to the old and new address. ' +
      'Writes EMAIL_CHANGED to audit_log. Refresh the session afterwards to get an access token carrying the new email.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'INVALID_REQUEST: malformed email, or the same as the current one.' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: `${PASSWORD_401} Or ${TOKEN_401}` })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'EMAIL_IN_USE: another account already uses this email.' })
  async changeEmail(@Req() request: AuthenticatedRequest, @Body() body: ChangeEmailRequestDto): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.settings.changeEmail(request.userId, body.newEmail, body.currentPassword));
  }

  /** Every session ends, this one included; the response carries a fresh pair so the caller stays signed in. */
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change your password',
    description:
      'Requires the current password; the new one follows the registration rule. Signs out every other session and returns a new ' +
      'token pair for this one -- the refresh token the caller held is no longer valid. Writes PASSWORD_CHANGED to audit_log and emails a notice.',
  })
  @ApiOkResponse({ type: RefreshResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'INVALID_REQUEST: the new password breaks the 8-128 character rule.' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: `${PASSWORD_401} Or ${TOKEN_401}` })
  async changePassword(@Req() request: AuthenticatedRequest, @Body() body: ChangePasswordRequestDto): Promise<RefreshResponseDto> {
    const user = await this.settings.changePassword(request.userId, body.currentPassword, body.newPassword);
    const traderLevel = await this.tierService.findTraderLevel(user.userId);
    const riskProfile = await this.tierService.findRiskProfile(user.userId);
    const refreshToken = await this.refreshTokenService.issue(user);
    const accessToken = this.jwtService.issueToken(user.userId, user.email, traderLevel, user.userRole, riskProfile, refreshToken);
    return new RefreshResponseDto(accessToken, refreshToken);
  }
}
