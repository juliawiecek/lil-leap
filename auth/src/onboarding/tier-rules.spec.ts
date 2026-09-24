import { assignTier, investableCapacity } from './tier-rules';
import { NetWorthBracket } from './enums/net-worth-bracket.enum';
import { TraderLevel } from './enums/trader-level.enum';
import { InsufficientInvestableAssetsException } from './exceptions/insufficient-investable-assets.exception';

describe('tier rules (TS-06.4)', () => {
  // The story's test-case table: net worth, income -> capacity -> tier.
  it.each([
    [NetWorthBracket.ZERO_TO_5K, '50,000', 5_000, TraderLevel.NOVICE],
    [NetWorthBracket.FIVE_TO_25K, null, 5_000, TraderLevel.NOVICE],
    [NetWorthBracket.TWENTY_FIVE_TO_100K, '200000', 45_000, TraderLevel.NOVICE],
    [NetWorthBracket.HUNDRED_TO_500K, null, 100_000, TraderLevel.ADVANCED],
    [NetWorthBracket.TWENTY_FIVE_TO_100K, null, 25_000, TraderLevel.NOVICE],
    [NetWorthBracket.OVER_500K, '0', 500_000, TraderLevel.ADVANCED],
  ])('%s with income %s -> capacity %d -> %s', (bracket, income, capacity, tier) => {
    expect(investableCapacity(bracket, income)).toBe(capacity);
    expect(assignTier(bracket, income).traderLevel).toBe(tier);
  });

  it('rejects capacity below $5,000 with the 422 message', () => {
    expect(() => assignTier(NetWorthBracket.ZERO_TO_5K, null)).toThrow(InsufficientInvestableAssetsException);
    expect(() => assignTier(NetWorthBracket.ZERO_TO_5K, '49,999')).toThrow(
      'A minimum of $5,000 in investable assets is required',
    );
  });

  it('promotes on income alone once capacity reaches $100,000', () => {
    expect(assignTier(NetWorthBracket.TWENTY_FIVE_TO_100K, '750000').traderLevel).toBe(TraderLevel.ADVANCED);
    expect(assignTier(NetWorthBracket.TWENTY_FIVE_TO_100K, '749999.99').traderLevel).toBe(TraderLevel.NOVICE);
  });

  it('sets the minimum balance for the assigned tier', () => {
    expect(assignTier(NetWorthBracket.FIVE_TO_25K, null).minBalanceRequirement).toBe('5000.00');
    expect(assignTier(NetWorthBracket.OVER_500K, null).minBalanceRequirement).toBe('100000.00');
  });

  it('treats a blank or unparseable income as zero', () => {
    expect(investableCapacity(NetWorthBracket.FIVE_TO_25K, '')).toBe(5_000);
    expect(investableCapacity(NetWorthBracket.FIVE_TO_25K, 'n/a')).toBe(5_000);
  });
});
