import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../user/user-role.enum';
import { UserAlreadyExistsException } from '../user/exceptions/user-already-exists.exception';
import { RegisterRequestDto } from '../user/dto/register-request.dto';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { SsnEncryptionService } from '../security/ssn-encryption.service';
import { CustomerProfile } from './entities/customer-profile.entity';
import { FinancialProfile } from './entities/financial-profile.entity';
import { Account } from './entities/account.entity';
import { AnalystProfile } from './entities/analyst-profile.entity';
import { TraderLevel } from './enums/trader-level.enum';

function trimToNull(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function escapeJson(value: string | null): string {
  if (value == null) return '';
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Registration business logic: one shared entry point, branching by role. */
@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    @InjectRepository(FinancialProfile)
    private readonly financialProfileRepository: Repository<FinancialProfile>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(AnalystProfile)
    private readonly analystProfileRepository: Repository<AnalystProfile>,
    private readonly passwordEncoder: PasswordEncoderService,
    private readonly ssnEncryptionService: SsnEncryptionService,
    private readonly dataSource: DataSource,
  ) {}

  async register(request: RegisterRequestDto): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const normalizedEmail = request.email.trim().toLowerCase();

      const existing = await manager
        .createQueryBuilder(User, 'user')
        .where('LOWER(user.email) = :email', { email: normalizedEmail })
        .getOne();
      if (existing) {
        throw new UserAlreadyExistsException('An account with this email already exists.');
      }

      const user = manager.create(User, {
        email: normalizedEmail,
        passwordHash: this.passwordEncoder.encode(request.password),
        userRole: request.userRole,
      });
      const savedUser = await manager.save(user);

      if (request.userRole === UserRole.ANALYST) {
        await this.registerAnalyst(manager, request, savedUser);
      } else {
        await this.registerTrader(manager, request, savedUser);
      }

      return savedUser;
    });
  }

  /** Persists the ANALYST-only extension table for a newly created user. */
  private async registerAnalyst(
    manager: import('typeorm').EntityManager,
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
   * Persists the TRADER-only extension tables for a newly created user:
   * identity/contact profile, financial onboarding profile, and a trading
   * account.
   */
  private async registerTrader(
    manager: import('typeorm').EntityManager,
    request: RegisterRequestDto,
    user: User,
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
      annualIncome: this.parseCurrencyAmount(request.annualIncome),
      liquidityPosition: this.normalizeMoney(request.liquidityPosition),
      politicallyExposedPerson: request.politicallyExposedPerson === true,
      regulatoryDisclosures: this.buildRegulatoryDisclosuresJson(request),
      beneficialOwnerInfo: this.buildBeneficialOwnerJson(request),
      fundsSourceVerified: false,
    });
    await manager.save(financialProfile);

    const account = manager.create(Account, {
      user,
      accountNumber: this.generateAccountNumber(),
      accountName: request.accountName!.trim(),
      accountType: request.accountType!,
      traderLevel: request.traderLevel!,
      minBalanceRequirement: this.minBalanceFor(request.traderLevel!),
    });
    await manager.save(account);
  }

  /** Validates that the user is at least 18 years old. */
  private validateAdult(dateOfBirth: string): void {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (Number.isNaN(dob.getTime()) || age < 18) {
      throw new BadRequestException('User must be at least 18 years old.');
    }
  }

  /** Joins structured address fields into the single address column expected by schema. */
  private buildAddressLine(request: RegisterRequestDto): string {
    const apartment = trimToNull(request.apartment);
    const parts = apartment
      ? [request.streetAddress!.trim(), apartment, request.city!.trim(), request.stateProvince!.trim(), request.postalCode!.trim()]
      : [request.streetAddress!.trim(), request.city!.trim(), request.stateProvince!.trim(), request.postalCode!.trim()];
    return parts.join(', ');
  }

  private buildRegulatoryDisclosuresJson(request: RegisterRequestDto): string {
    return (
      '{' +
      `"brokerAffiliation":${request.brokerAffiliation === true},` +
      `"brokerFirmName":"${escapeJson(trimToNull(request.brokerFirmName))}",` +
      `"brokerAffiliationDetails":"${escapeJson(trimToNull(request.brokerAffiliationDetails))}",` +
      `"controlPerson":${request.controlPerson === true},` +
      `"controlCompanyName":"${escapeJson(trimToNull(request.controlCompanyName))}",` +
      `"controlCompanyRole":"${escapeJson(trimToNull(request.controlCompanyRole))}"` +
      '}'
    );
  }

  private buildBeneficialOwnerJson(request: RegisterRequestDto): string {
    return (
      '{' +
      `"otherBeneficialOwner":${request.otherBeneficialOwner === true},` +
      `"beneficialOwnerName":"${escapeJson(trimToNull(request.beneficialOwnerName))}",` +
      `"beneficialOwnerRelationship":"${escapeJson(trimToNull(request.beneficialOwnerRelationship))}"` +
      '}'
    );
  }

  /** Removes all non-digit SSN separators. */
  private normalizeSsn(value?: string | null): string | null {
    const trimmed = trimToNull(value);
    return trimmed == null ? null : trimmed.replace(/\D/g, '');
  }

  /** Removes currency separators from numeric text values. */
  private normalizeMoney(value?: string | null): string | null {
    const trimmed = trimToNull(value);
    return trimmed == null ? null : trimmed.replace(/,/g, '');
  }

  /** Parses a currency string into a decimal amount (kept as a string for numeric column binding). */
  private parseCurrencyAmount(value?: string | null): string | null {
    return this.normalizeMoney(value);
  }

  /** Generates a deterministic-length account number with an NT prefix. */
  private generateAccountNumber(): string {
    return 'NT' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  }

  /** Returns minimum balance by trader level. */
  private minBalanceFor(traderLevel: TraderLevel): string {
    return traderLevel === TraderLevel.ADVANCED ? '100000.00' : '5000.00';
  }
}
