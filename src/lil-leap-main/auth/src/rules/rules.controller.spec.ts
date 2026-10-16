import { RulesController } from './rules.controller';
import { TierService, TierEligibilityRow } from '../onboarding/tier.service';
import { AuthenticatedRequest } from '../security/access-token.guard';
import { AccountNotFoundException } from '../user/exceptions/account-not-found.exception';
import { TraderLevel } from '../onboarding/enums/trader-level.enum';

describe('RulesController', () => {
  let tierService: { findEligibility: jest.Mock };
  let controller: RulesController;
  const request = { userId: '11111111-1111-1111-1111-111111111111' } as AuthenticatedRequest;

  const row = (overrides: Partial<TierEligibilityRow> = {}): TierEligibilityRow => ({
    trader_level: TraderLevel.NOVICE,
    min_balance_requirement: '5000.00',
    current_balance: '7250.50',
    tier_status: 'ELIGIBLE',
    ...overrides,
  });

  beforeEach(() => {
    tierService = { findEligibility: jest.fn() };
    controller = new RulesController(tierService as unknown as TierService);
  });

  it('returns the view row for the caller, with numbers as numbers', async () => {
    tierService.findEligibility.mockResolvedValue(row());

    const result = await controller.tierEligibility(request);

    expect(tierService.findEligibility).toHaveBeenCalledWith(request.userId);
    expect(result).toEqual({
      trader_level: 'NOVICE',
      min_balance_requirement: 5000,
      current_balance: 7250.5,
      tier_status: 'ELIGIBLE',
      next_tier: 'ADVANCED',
      gap_to_next_tier: 92749.5,
    });
  });

  it('never reports a negative gap for a NOVICE already holding the ADVANCED minimum', async () => {
    tierService.findEligibility.mockResolvedValue(row({ current_balance: '150000.00' }));

    expect((await controller.tierEligibility(request)).gap_to_next_tier).toBe(0);
  });

  it('reports next_tier and gap_to_next_tier as null for ADVANCED', async () => {
    tierService.findEligibility.mockResolvedValue(
      row({ trader_level: TraderLevel.ADVANCED, min_balance_requirement: '100000.00', tier_status: 'INELIGIBLE' }),
    );

    const result = await controller.tierEligibility(request);

    expect(result).toMatchObject({ trader_level: 'ADVANCED', tier_status: 'INELIGIBLE', next_tier: null, gap_to_next_tier: null });
  });

  it('404s for a user without an account', async () => {
    tierService.findEligibility.mockResolvedValue(null);

    await expect(controller.tierEligibility(request)).rejects.toThrow(AccountNotFoundException);
  });
});
