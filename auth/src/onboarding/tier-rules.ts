import { NetWorthBracket } from './enums/net-worth-bracket.enum';
import { TraderLevel } from './enums/trader-level.enum';
import { InsufficientInvestableAssetsException } from './exceptions/insufficient-investable-assets.exception';

/** Lower bound of each declared net-worth bracket, in dollars. */
const NET_WORTH_FLOOR: Record<NetWorthBracket, number> = {
  [NetWorthBracket.ZERO_TO_5K]: 0,
  [NetWorthBracket.FIVE_TO_25K]: 5_000,
  [NetWorthBracket.TWENTY_FIVE_TO_100K]: 25_000,
  [NetWorthBracket.HUNDRED_TO_500K]: 100_000,
  [NetWorthBracket.OVER_500K]: 500_000,
};

const INCOME_WEIGHT = 0.1;

/** Minimum cash balance each tier must hold -- also the capacity needed to be assigned it. */
export const TIER_MIN_BALANCE: Record<TraderLevel, number> = {
  [TraderLevel.NOVICE]: 5_000,
  [TraderLevel.ADVANCED]: 100_000,
};

export interface TierAssignment {
  traderLevel: TraderLevel;
  /** Formatted for the numeric(18,2) column. */
  minBalanceRequirement: string;
}

/** capacity = net_worth_floor + annual_income x 10%. A missing or unparseable income counts as 0. */
export function investableCapacity(netWorthBracket: NetWorthBracket, annualIncome?: string | null): number {
  const income = Number((annualIncome ?? '').replace(/,/g, ''));
  return NET_WORTH_FLOOR[netWorthBracket] + (Number.isFinite(income) ? income : 0) * INCOME_WEIGHT;
}

/**
 * Assigns the trader tier from declared finances (TS-06.4). The client never
 * chooses its own tier; below the NOVICE threshold registration is refused.
 */
export function assignTier(netWorthBracket: NetWorthBracket, annualIncome?: string | null): TierAssignment {
  const capacity = investableCapacity(netWorthBracket, annualIncome);

  const traderLevel =
    capacity >= TIER_MIN_BALANCE[TraderLevel.ADVANCED]
      ? TraderLevel.ADVANCED
      : capacity >= TIER_MIN_BALANCE[TraderLevel.NOVICE]
        ? TraderLevel.NOVICE
        : null;

  if (traderLevel == null) {
    throw new InsufficientInvestableAssetsException();
  }

  return { traderLevel, minBalanceRequirement: TIER_MIN_BALANCE[traderLevel].toFixed(2) };
}
