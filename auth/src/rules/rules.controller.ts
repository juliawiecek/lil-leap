import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { TierService } from '../onboarding/tier.service';
import { AccessTokenGuard, AuthenticatedRequest } from '../security/access-token.guard';
import { AccountNotFoundException } from '../user/exceptions/account-not-found.exception';
import { TierEligibilityResponseDto } from './dto/tier-eligibility-response.dto';

/** Read-only trading-rule lookups for the signed-in user. Served at /rules (outside the /auth prefix). */
@Controller('rules')
@UseGuards(AccessTokenGuard)
export class RulesController {
  constructor(private readonly tierService: TierService) {}

  /** The caller's tier, its minimum balance, and how far the account is from the next tier (TS-06.4). */
  @Get('tier-eligibility')
  async tierEligibility(@Req() request: AuthenticatedRequest): Promise<TierEligibilityResponseDto> {
    const row = await this.tierService.findEligibility(request.userId);
    if (!row) {
      throw new AccountNotFoundException();
    }
    return TierEligibilityResponseDto.from(row);
  }
}
