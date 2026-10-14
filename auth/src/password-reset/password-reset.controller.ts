import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { ResetPasswordRequestDto } from './dto/reset-password-request.dto';

/** Forgot-password endpoints (TS-15.9). No access token: the caller can't sign in yet. */
@ApiTags('auth')
@Controller()
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  /** Always 202, whether or not the email is registered, so the response can't be used to find accounts. */
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset link',
    description: 'Always 202. A registered email gets a link that expires in 20 minutes and works once.',
  })
  @ApiAcceptedResponse({ description: 'Accepted; a link is sent if the email is registered.' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'INVALID_REQUEST: email missing or malformed.' })
  async forgotPassword(@Body() request: ForgotPasswordRequestDto): Promise<void> {
    await this.passwordResetService.requestReset(request.email);
  }

  /** Sets the new password and revokes every refresh token the user holds. */
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password with a reset token',
    description: 'Burns the token and signs the user out of every session.',
  })
  @ApiNoContentResponse({ description: 'Password changed.' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'INVALID_RESET_TOKEN: unknown, expired or already used. INVALID_REQUEST: password too short or too long.',
  })
  async resetPassword(@Body() request: ResetPasswordRequestDto): Promise<void> {
    await this.passwordResetService.resetPassword(request.token, request.newPassword);
  }
}
