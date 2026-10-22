import { TierService, TierEligibilityRow } from './tier.service';
import { TraderLevel } from './enums/trader-level.enum';
import { RiskProfile } from './enums/risk-profile.enum';

describe('TierService', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  let accountRepository: { findOne: jest.Mock; query: jest.Mock };
  let financialProfileRepository: { findOne: jest.Mock };
  let service: TierService;

  beforeEach(() => {
    accountRepository = { findOne: jest.fn(), query: jest.fn() };
    financialProfileRepository = { findOne: jest.fn() };
    service = new TierService(accountRepository as any, financialProfileRepository as any);
  });

  describe('findTraderLevel', () => {
    it.each([TraderLevel.NOVICE, TraderLevel.ADVANCED])('returns %s from the user account', async (level) => {
      accountRepository.findOne.mockResolvedValue({ traderLevel: level });

      await expect(service.findTraderLevel(userId)).resolves.toBe(level);
    });

    it('reads the oldest account for the user, the one opened at registration', async () => {
      accountRepository.findOne.mockResolvedValue({ traderLevel: TraderLevel.NOVICE });

      await service.findTraderLevel(userId);

      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { user: { userId } },
        order: { createdAt: 'ASC' },
      });
    });

    it('returns null for a user without an account (an analyst)', async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(service.findTraderLevel(userId)).resolves.toBeNull();
    });

    it('returns null when the account has no tier assigned', async () => {
      accountRepository.findOne.mockResolvedValue({ traderLevel: undefined });

      await expect(service.findTraderLevel(userId)).resolves.toBeNull();
    });
  });

  describe('findRiskProfile', () => {
    it('returns the risk profile from the financial profile', async () => {
      financialProfileRepository.findOne.mockResolvedValue({ riskProfile: RiskProfile.MODERATE });

      await expect(service.findRiskProfile(userId)).resolves.toBe(RiskProfile.MODERATE);
      expect(financialProfileRepository.findOne).toHaveBeenCalledWith({ where: { user: { userId } } });
    });

    it('returns null when the user has no financial profile', async () => {
      financialProfileRepository.findOne.mockResolvedValue(null);

      await expect(service.findRiskProfile(userId)).resolves.toBeNull();
    });

    it('returns null when the financial profile has no risk profile set', async () => {
      financialProfileRepository.findOne.mockResolvedValue({ riskProfile: null });

      await expect(service.findRiskProfile(userId)).resolves.toBeNull();
    });
  });

  describe('findEligibility', () => {
    const eligible: TierEligibilityRow = {
      trader_level: TraderLevel.ADVANCED,
      min_balance_requirement: '100000.00',
      current_balance: '150000.00',
      tier_status: 'ELIGIBLE',
    };

    it('returns the eligibility row for the user, parameterised by user id', async () => {
      accountRepository.query.mockResolvedValue([eligible]);

      await expect(service.findEligibility(userId)).resolves.toEqual(eligible);

      const [sql, params] = accountRepository.query.mock.calls[0];
      expect(sql).toContain('FROM v_trader_tier_eligibility');
      expect(sql).toContain('WHERE v.user_id = $1');
      expect(sql).toMatch(/ORDER BY a\.created_at ASC\s+LIMIT 1/);
      expect(params).toEqual([userId]);
    });

    it('passes through an INELIGIBLE row unchanged, numeric columns still strings', async () => {
      const ineligible: TierEligibilityRow = {
        trader_level: TraderLevel.NOVICE,
        min_balance_requirement: '5000.00',
        current_balance: '4999.99',
        tier_status: 'INELIGIBLE',
      };
      accountRepository.query.mockResolvedValue([ineligible]);

      const row = await service.findEligibility(userId);

      expect(row?.tier_status).toBe('INELIGIBLE');
      expect(row?.current_balance).toBe('4999.99');
    });

    it('returns null for a user without an account', async () => {
      accountRepository.query.mockResolvedValue([]);

      await expect(service.findEligibility(userId)).resolves.toBeNull();
    });
  });
});
