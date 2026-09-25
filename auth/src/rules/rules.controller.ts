import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { TierService } from '../onboarding/tier.service';
import { AccessTokenGuard, AuthenticatedRequest } from '../security/access-token.guard';
import { AccountNotFoundException } from '../user/exceptions/account-not-found.exception';
import { TierEligibilityResponseDto } from './dto/tier-eligibility-response.dto';

/** Read-only trading-rule lookups for the signed-in user. Served at /rules (outside the /auth prefix). */
@ApiTags('rules')
@ApiBearerAuth()
@Controller('rules')
@UseGuards(AccessTokenGuard)
export class RulesController {
  constructor(private readonly tierService: TierService) {}

  /** The caller's tier, its minimum balance, and how far the account is from the next tier (NEXT-152). */
  @Get('tier-eligibility')
  @ApiOperation({ summary: "The caller's trader tier, balance against its minimum, and gap to the next tier" })
  @ApiOkResponse({ type: TierEligibilityResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'INVALID_ACCESS_TOKEN: missing, invalid or expired Bearer token.' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'ACCOUNT_NOT_FOUND: the user has no trading account (e.g. an ANALYST).' })
  async tierEligibility(@Req() request: AuthenticatedRequest): Promise<TierEligibilityResponseDto> {
    const row = await this.tierService.findEligibility(request.userId);
    if (!row) {
      throw new AccountNotFoundException();
    }
    return TierEligibilityResponseDto.from(row);
  }
}
