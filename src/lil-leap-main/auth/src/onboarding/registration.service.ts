import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../user/user-role.enum';
import { UserAlreadyExistsException } from '../user/exceptions/user-already-exists.exception';
import { normalizeEmail, UserService } from '../user/user.service';
import { RegisterRequestDto } from '../user/dto/register-request.dto';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { SsnEncryptionService } from '../security/ssn-encryption.service';
import { CustomerProfile } from './entities/customer-profile.entity';
import { FinancialProfile } from './entities/financial-profile.entity';
import { Account } from './entities/account.entity';
import { AnalystProfile } from './entities/analyst-profile.entity';
import { assignTier, TierAssignment } from './tier-rules';
import { InitialDepositBelowMinimumException } from './exceptions/initial-deposit-below-minimum.exception';
import { InitialDepositAboveLiquidityException } from './exceptions/initial-deposit-above-liquidity.exception';

function trimToNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const MONEY = /^\d{1,16}(?:\.\d{1,2})?$/;

/** Whole cents of a dollar amount ("10,000.5" -> 1000050n), or null when it is not a valid amount. */
function toCents(value?: string | null): bigint | null {
  const plain = trimToNull(value)?.replaceAll(',', '');
  if (plain == null || !MONEY.test(plain)) {
    return null;
  }
  const [dollars, fraction = ''] = plain.split('.');
  return BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Formats cents for the numeric(18,2) columns (1000050n -> "10000.50"). */
function centsToAmount(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** Registration business logic: one shared entry point, branching by role. */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly userService: UserService,
    private readonly passwordEncoder: PasswordEncoderService,
    private readonly ssnEncryptionService: SsnEncryptionService,
    private readonly dataSource: DataSource,
  ) {}

  async register(request: RegisterRequestDto): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      if (await this.userService.findByEmail(request.email, manager)) {
        throw new UserAlreadyExistsException();
      }

      // Decided before any row is written, so a rejected applicant leaves nothing behind.
      const tier = request.userRole === UserRole.TRADER ? assignTier(request.netWorthBracket!, request.annualIncome) : null;
      const initialDeposit = tier ? this.validateInitialDeposit(request, tier) : null;

      const user = manager.create(User, {
        email: normalizeEmail(request.email),
        passwordHash: this.passwordEncoder.encode(request.password),
        userRole: request.userRole,
      });
      const savedUser = await manager.save(user);

      if (request.userRole === UserRole.ANALYST) {
        await this.registerAnalyst(manager, request, savedUser);
      } else {
        await this.registerTrader(manager, request, savedUser, tier!, initialDeposit!);
      }

      return savedUser;
    });
  }

  /** Persists the ANALYST-only extension table for a newly created user. */
  private async registerAnalyst(
    manager: EntityManager,
    request: RegisterRequestDto,
    user: User,
  ): Promise<void> {
    const profile = manager.create(AnalystProfile, {
      user,
      employeeId: request.employeeId!.trim(),
      department: trimToNull(request.department),
    });
    await manager.save(profile);
  }

  /**
   * The initial deposit (NEXT-214) must cover the assigned tier's minimum balance and may not
   * exceed the declared liquidity position. Checked before anything is written.
   * @returns the deposit formatted for the numeric(18,2) columns
   */
  private validateInitialDeposit(request: RegisterRequestDto, tier: TierAssignment): string {
    const deposit = toCents(request.initialDeposit);
    if (deposit == null) {
      throw new BadRequestException('initial_deposit must be a nonnegative amount with up to two decimal places.');
    }
    const liquidity = toCents(request.liquidityPosition);
    if (liquidity == null) {
      throw new BadRequestException('liquidity_position must be a nonnegative amount with up to two decimal places.');
    }
    const minimum = toCents(tier.minBalanceRequirement)!;
    if (deposit < minimum) {
      throw new InitialDepositBelowMinimumException(Number(minimum / 100n).toLocaleString('en-US'));
    }
    if (deposit > liquidity) {
      throw new InitialDepositAboveLiquidityException();
    }
    return centsToAmount(deposit);
  }

  /**
   * Persists the TRADER-only extension tables for a newly created user:
   * identity/contact profile, financial onboarding profile, a trading account
   * at the server-assigned tier, and the initial deposit that funds it.
   */
  private async registerTrader(
    manager: EntityManager,
    request: RegisterRequestDto,
    user: User,
    tier: TierAssignment,
    initialDeposit: string,
  ): Promise<void> {
    this.validateAdult(request.dateOfBirth!);

    // Store SSN encrypted in customer profile; user auth table does not carry SSN.
    const normalizedSsn = this.normalizeSsn(request.ssn);
    if (!normalizedSsn) {
      throw new BadRequestException('SSN is required for TRADER registration.');
    }
    const encryptedSsn = await this.ssnEncryptionService.encrypt(normalizedSsn);

    const profile = manager.create(CustomerProfile, {
      user,
      firstName: request.firstName!.trim(),
      lastName: request.lastName!.trim(),
      dateOfBirth: request.dateOfBirth!,
      phone: request.phone!.trim(),
      address: this.buildAddressLine(request),
      country: request.country!.trim(),
      citizenshipStatus: request.citizenshipStatus!,
      ssnEncrypted: encryptedSsn,
    });
    await manager.save(profile);

    const financialProfile = manager.create(FinancialProfile, {
      user,
      accreditedInvestor: request.accreditedInvestor === true,
      netWorthBracket: request.netWorthBracket!,
      riskProfile: request.riskProfile!,
      employmentStatus: request.employmentStatus!,
      employerName: trimToNull(request.employerName),
      occupation: trimToNull(request.occupation),
      annualIncome: this.normalizeMoney(request.annualIncome),
      liquidityPosition: this.normalizeMoney(request.liquidityPosition),
      politicallyExposedPerson: request.politicallyExposedPerson === true,
      regulatoryDisclosures: this.buildRegulatoryDisclosures(request),
      beneficialOwnerInfo: this.buildBeneficialOwnerInfo(request),
      fundsSourceVerified: false,
    });
    await manager.save(financialProfile);

    const account = manager.create(Account, {
      user,
      accountNumber: this.generateAccountNumber(),
      accountName: request.accountName!.trim(),
      accountType: request.accountType!,
      traderLevel: tier.traderLevel,
      minBalanceRequirement: tier.minBalanceRequirement,
      // Funded at registration, so the client can trade straight away (NEXT-214).
      accountStatus: 'ACTIVE',
      tradingEnabled: true,
    });
    const savedAccount = await manager.save(account);
    await this.fundAccount(manager, user, savedAccount.accountId, initialDeposit);
  }

  /** Records the opening deposit in the cash ledger, its balance cache and the audit log. */
  private async fundAccount(manager: EntityManager, user: User, accountId: string, amount: string): Promise<void> {
    await manager.query(
      `INSERT INTO cash_transactions (account_id, transaction_type, amount, settlement_status, settled_at)
       VALUES ($1, 'DEPOSIT', $2, 'SETTLED', CURRENT_TIMESTAMP)`,
      [accountId, amount],
    );
    await manager.query('INSERT INTO cash_balances (account_id, balance) VALUES ($1, $2)', [accountId, amount]);
    await manager.query(
      `INSERT INTO audit_log (user_id, account_id, actor_type, event_type, payload)
       VALUES ($1, $2, 'USER', 'ACCOUNT_FUNDED', jsonb_build_object('amount', $3::numeric))`,
      [user.userId, accountId, amount],
    );
  }

  /** Validates that the user is at least 21 years old. */
  private validateAdult(dateOfBirth: string): void {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (Number.isNaN(dob.getTime()) || age < 21) {
      throw new BadRequestException('User must be at least 21 years old.');
    }
  }

  /** Joins structured address fields into the single address column expected by schema. */
  private buildAddressLine(request: RegisterRequestDto): string {
    return [request.streetAddress, request.apartment, request.city, request.stateProvince, request.postalCode]
      .map(trimToNull)
      .filter((part) => part != null)
      .join(', ');
  }

  // Plain objects -- TypeORM serializes jsonb itself; a pre-built string would be stored as a JSON string scalar.
  private buildRegulatoryDisclosures(request: RegisterRequestDto): Record<string, unknown> {
    return {
      brokerAffiliation: request.brokerAffiliation === true,
      brokerFirmName: trimToNull(request.brokerFirmName) ?? '',
      brokerAffiliationDetails: trimToNull(request.brokerAffiliationDetails) ?? '',
      controlPerson: request.controlPerson === true,
      controlCompanyName: trimToNull(request.controlCompanyName) ?? '',
      controlCompanyRole: trimToNull(request.controlCompanyRole) ?? '',
    };
  }

  private buildBeneficialOwnerInfo(request: RegisterRequestDto): Record<string, unknown> {
    return {
      otherBeneficialOwner: request.otherBeneficialOwner === true,
      beneficialOwnerName: trimToNull(request.beneficialOwnerName) ?? '',
      beneficialOwnerRelationship: trimToNull(request.beneficialOwnerRelationship) ?? '',
    };
  }

  /** Removes all non-digit SSN separators. */
  private normalizeSsn(value?: string | null): string | null {
    const trimmed = trimToNull(value);
    return trimmed == null ? null : trimmed.replace(/\D/g, '');
  }

  /** Removes currency separators; kept as a string for numeric column binding. */
  private normalizeMoney(value?: string | null): string | null {
    const trimmed = trimToNull(value);
    return trimmed == null ? null : trimmed.replaceAll(',', '');
  }

  /** Generates a deterministic-length account number with an NT prefix. */
  private generateAccountNumber(): string {
    return 'NT' + randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  }
}
