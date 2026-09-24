import { ApiProperty } from '@nestjs/swagger';
import { TraderLevel } from '../../onboarding/enums/trader-level.enum';
import { TIER_MIN_BALANCE } from '../../onboarding/tier-rules';
import { TierEligibilityRow } from '../../onboarding/tier.service';

/** Tier above each level; ADVANCED is the top. */
const NEXT_TIER: Record<TraderLevel, TraderLevel | null> = {
  [TraderLevel.NOVICE]: TraderLevel.ADVANCED,
  [TraderLevel.ADVANCED]: null,
};

/** GET /rules/tier-eligibility body. snake_case to match the view and the register wire format. */
export class TierEligibilityResponseDto {
  @ApiProperty({ enum: TraderLevel, description: 'Assigned by the server at registration.' })
  trader_level: TraderLevel;

  @ApiProperty({ example: 5000, description: 'Minimum cash balance for this tier, in dollars.' })
  min_balance_requirement: number;

  @ApiProperty({ example: 7250.5, description: 'Sum of the account cash ledger, in dollars.' })
  current_balance: number;

  @ApiProperty({ enum: ['ELIGIBLE', 'INELIGIBLE'], description: 'ELIGIBLE once current_balance >= min_balance_requirement.' })
  tier_status: 'ELIGIBLE' | 'INELIGIBLE';

  @ApiProperty({ enum: TraderLevel, nullable: true, description: 'null for ADVANCED, the top tier.' })
  next_tier: TraderLevel | null;

  /** Cash still needed to meet the next tier's minimum balance; 0 once met, null at the top tier. */
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 92749.5,
    description: "Cash still needed to reach next_tier's minimum balance; 0 once met, null for ADVANCED.",
  })
  gap_to_next_tier: number | null;

  static from(row: TierEligibilityRow): TierEligibilityResponseDto {
    const currentBalance = Number(row.current_balance);
    const nextTier = NEXT_TIER[row.trader_level];

    const dto = new TierEligibilityResponseDto();
    dto.trader_level = row.trader_level;
    dto.min_balance_requirement = Number(row.min_balance_requirement);
    dto.current_balance = currentBalance;
    dto.tier_status = row.tier_status;
    dto.next_tier = nextTier;
    dto.gap_to_next_tier = nextTier == null ? null : Math.max(0, TIER_MIN_BALANCE[nextTier] - currentBalance);
    return dto;
  }
}
