import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { TraderLevel } from './enums/trader-level.enum';

/** One row of v_trader_tier_eligibility; numeric columns arrive from pg as strings. */
export interface TierEligibilityRow {
  trader_level: TraderLevel;
  min_balance_requirement: string;
  current_balance: string;
  tier_status: 'ELIGIBLE' | 'INELIGIBLE';
}

/**
 * Reads a user's assigned tier. A user holds at most one account today; if that
 * changes, the oldest (the one opened at registration) is the one that counts.
 */
@Injectable()
export class TierService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  /** The tier for the JWT claim, or null for a user without an account (analysts). */
  async findTraderLevel(userId: string): Promise<TraderLevel | null> {
    const account = await this.accountRepository.findOne({
      where: { user: { userId } },
      order: { createdAt: 'ASC' },
    });
    return account?.traderLevel ?? null;
  }

  /** Eligibility of the user's account against its tier's minimum balance, or null without an account. */
  async findEligibility(userId: string): Promise<TierEligibilityRow | null> {
    const [row] = await this.accountRepository.query(
      `SELECT v.trader_level, v.min_balance_requirement, v.current_balance, v.tier_status
         FROM v_trader_tier_eligibility v
         JOIN accounts a USING (account_id)
        WHERE v.user_id = $1
        ORDER BY a.created_at ASC
        LIMIT 1`,
      [userId],
    );
    return row ?? null;
  }
}
