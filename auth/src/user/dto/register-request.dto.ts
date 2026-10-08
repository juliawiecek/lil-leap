import { Expose } from 'class-transformer';
import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { AccountType } from '../../onboarding/enums/account-type.enum';
import { CitizenshipStatus } from '../../onboarding/enums/citizenship-status.enum';
import { EmploymentStatus } from '../../onboarding/enums/employment-status.enum';
import { NetWorthBracket } from '../../onboarding/enums/net-worth-bracket.enum';
import { RiskProfile } from '../../onboarding/enums/risk-profile.enum';
import { UserRole } from '../user-role.enum';

function notBlank(value?: string | null): boolean {
  return value != null && value.trim().length > 0;
}

/** Cross-field rules a per-field decorator can't express (e.g. employeeId required only for ANALYST). */
@ValidatorConstraint({ name: 'registerRequestBusinessRules', async: false })
class RegisterRequestBusinessRulesValidator implements ValidatorConstraintInterface {
  private failureMessage = '';

  validate(_: unknown, args?: ValidationArguments): boolean {
    const r = args!.object as RegisterRequestDto;

    if (!this.validateTraderRules(r)) {
      return false;
    }

    return this.validateAnalystRules(r) && this.validateAffiliationRules(r);
  }

  private validateAnalystRules(r: RegisterRequestDto): boolean {
    if (r.userRole !== UserRole.ANALYST) {
      return true;
    }
    return notBlank(r.employeeId) || this.fail('employeeId is required for ANALYST registration');
  }

  private validateAffiliationRules(r: RegisterRequestDto): boolean {
    const affiliationRules: Array<{ enabled: boolean; valid: boolean; message: string }> = [
      {
        enabled: r.brokerAffiliation === true,
        valid: this.hasPair(r.brokerFirmName, r.brokerAffiliationDetails),
        message: 'Broker firm name and affiliation details are required when broker affiliation is true',
      },
      {
        enabled: r.controlPerson === true,
        valid: this.hasPair(r.controlCompanyName, r.controlCompanyRole),
        message: 'Control company name and role are required when control person is true',
      },
      {
        enabled: r.otherBeneficialOwner === true,
        valid: this.hasPair(r.beneficialOwnerName, r.beneficialOwnerRelationship),
        message: 'Beneficial owner name and relationship are required when other beneficial owner is true',
      },
    ];
    for (const rule of affiliationRules) {
      if (rule.enabled && !rule.valid) {
        return this.fail(rule.message);
      }
    }

    return true;
  }

  private validateTraderRules(r: RegisterRequestDto): boolean {
    if (r.userRole !== UserRole.TRADER) {
      return true;
    }

    if (!this.hasTraderIdentity(r)) {
      return this.fail(
        'firstName, lastName, dateOfBirth, phone, streetAddress, city, stateProvince, postalCode, country and citizenshipStatus are required for TRADER registration',
      );
    }

    if (!this.hasTraderFinancials(r)) {
      return this.fail(
        'employmentStatus, annualIncome, netWorthBracket, riskProfile, liquidityPosition, accreditedInvestor and isPoliticallyExposedPerson are required for TRADER registration',
      );
    }

    if (!this.hasPair(r.accountName, r.accountType)) {
      return this.fail('accountName and accountType are required for TRADER registration');
    }

    const employed =
      r.employmentStatus === EmploymentStatus.EMPLOYED || r.employmentStatus === EmploymentStatus.SELF_EMPLOYED;
    if (employed && !this.hasPair(r.employerName, r.occupation)) {
      return this.fail('Employer name and occupation are required for employed or self-employed status');
    }

    return true;
  }

  private hasTraderIdentity(r: RegisterRequestDto): boolean {
    return (
      notBlank(r.firstName) &&
      notBlank(r.lastName) &&
      r.dateOfBirth != null &&
      notBlank(r.phone) &&
      notBlank(r.streetAddress) &&
      notBlank(r.city) &&
      notBlank(r.stateProvince) &&
      notBlank(r.postalCode) &&
      notBlank(r.country) &&
      r.citizenshipStatus != null
    );
  }

  private hasTraderFinancials(r: RegisterRequestDto): boolean {
    return (
      r.employmentStatus != null &&
      notBlank(r.annualIncome) &&
      r.netWorthBracket != null &&
      r.riskProfile != null &&
      notBlank(r.liquidityPosition) &&
      r.accreditedInvestor != null &&
      r.politicallyExposedPerson != null
    );
  }

  private hasPair(left?: string | null, right?: unknown): boolean {
    return notBlank(left) && right != null;
  }

  private fail(message: string): boolean {
    this.failureMessage = message;
    return false;
  }


  defaultMessage(): string {
    return this.failureMessage;
  }
}

/**
 * Registers a user for either role -- `userRole` decides which fields are
 * required. Wire format is snake_case, matching the existing frontend forms.
 */
export class RegisterRequestDto {
  @ApiProperty({ name: 'user_role', enum: UserRole, description: 'Decides which of the other fields are required.' })
  @Expose({ name: 'user_role' })
  @IsEnum(UserRole)
  userRole: UserRole;

  @ApiProperty({ name: 'email', example: 'ada@example.com', maxLength: 320 })
  @Expose({ name: 'email' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ name: 'password', minLength: 8, maxLength: 128, format: 'password' })
  @Expose({ name: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  // ---- TRADER-only fields below; required only when userRole == TRADER ----

  @ApiPropertyOptional({ name: 'first_name', maxLength: 100, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'first_name' })
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ name: 'last_name', maxLength: 100, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'last_name' })
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ name: 'date_of_birth', format: 'date', example: '1990-12-10', description: 'Required when user_role is TRADER. The trader must be at least 21.' })
  @Expose({ name: 'date_of_birth' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ name: 'phone', maxLength: 30, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'phone' })
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ name: 'street_address', maxLength: 255, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'street_address' })
  @IsOptional()
  @MaxLength(255)
  streetAddress?: string;

  @ApiPropertyOptional({ name: 'apartment', maxLength: 255 })
  @Expose({ name: 'apartment' })
  @IsOptional()
  @MaxLength(255)
  apartment?: string;

  @ApiPropertyOptional({ name: 'city', maxLength: 100, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'city' })
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ name: 'state_province', maxLength: 100, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'state_province' })
  @IsOptional()
  @MaxLength(100)
  stateProvince?: string;

  @ApiPropertyOptional({ name: 'postal_code', maxLength: 20, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'postal_code' })
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ name: 'country', maxLength: 100, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'country' })
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ name: 'citizenship_status', enum: CitizenshipStatus, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'citizenship_status' })
  @IsOptional()
  @IsEnum(CitizenshipStatus)
  citizenshipStatus?: CitizenshipStatus;

  @ApiPropertyOptional({ name: 'ssn', pattern: String.raw`^(\d{9}|\d{3}-\d{2}-\d{4})?$`, example: '123-45-6789', description: 'Required when user_role is TRADER. Stored encrypted.' })
  @Expose({ name: 'ssn' })
  @IsOptional()
  @Matches(/^(\d{9}|\d{3}-\d{2}-\d{4})?$/, { message: 'SSN must be 9 digits or 123-45-6789' })
  ssn?: string;

  @ApiPropertyOptional({ name: 'employment_status', enum: EmploymentStatus, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'employment_status' })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @ApiPropertyOptional({ name: 'employer_name', maxLength: 255, description: 'Required when employment_status is EMPLOYED or SELF_EMPLOYED.' })
  @Expose({ name: 'employer_name' })
  @IsOptional()
  @MaxLength(255)
  employerName?: string;

  @ApiPropertyOptional({ name: 'occupation', maxLength: 100, description: 'Required when employment_status is EMPLOYED or SELF_EMPLOYED.' })
  @Expose({ name: 'occupation' })
  @IsOptional()
  @MaxLength(100)
  occupation?: string;

  @ApiPropertyOptional({ name: 'annual_income', maxLength: 32, example: '50,000', description: 'Required when user_role is TRADER. Dollars; commas allowed. Counts 10% towards tier capacity.' })
  @Expose({ name: 'annual_income' })
  @IsOptional()
  @MaxLength(32)
  annualIncome?: string;

  @ApiPropertyOptional({ name: 'net_worth_bracket', enum: NetWorthBracket, description: 'Required when user_role is TRADER. Its lower bound is the base of tier capacity.' })
  @Expose({ name: 'net_worth_bracket' })
  @IsOptional()
  @IsEnum(NetWorthBracket)
  netWorthBracket?: NetWorthBracket;

  @ApiPropertyOptional({ name: 'risk_profile', enum: RiskProfile, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'risk_profile' })
  @IsOptional()
  @IsEnum(RiskProfile)
  riskProfile?: RiskProfile;

  @ApiPropertyOptional({ name: 'liquidity_position', maxLength: 32, example: '10,000', description: 'Required when user_role is TRADER. Dollars; commas allowed.' })
  @Expose({ name: 'liquidity_position' })
  @IsOptional()
  @MaxLength(32)
  liquidityPosition?: string;

  @ApiPropertyOptional({ name: 'accredited_investor', description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'accredited_investor' })
  @IsOptional()
  @IsBoolean()
  accreditedInvestor?: boolean;

  @ApiPropertyOptional({ name: 'account_name', maxLength: 100, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'account_name' })
  @IsOptional()
  @MaxLength(100)
  accountName?: string;

  @ApiPropertyOptional({ name: 'account_type', enum: AccountType, description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'account_type' })
  @IsOptional()
  @IsEnum(AccountType)
  accountType?: AccountType;

  // No trader_level: the tier is assigned by the server (NEXT-152). The global
  // ValidationPipe whitelists, so a client-sent trader_level is silently dropped.

  @ApiPropertyOptional({ name: 'is_politically_exposed_person', description: 'Required when user_role is TRADER.' })
  @Expose({ name: 'is_politically_exposed_person' })
  @IsOptional()
  @IsBoolean()
  politicallyExposedPerson?: boolean;

  @ApiPropertyOptional({ name: 'broker_affiliation' })
  @Expose({ name: 'broker_affiliation' })
  @IsOptional()
  @IsBoolean()
  brokerAffiliation?: boolean;

  @ApiPropertyOptional({ name: 'broker_firm_name', maxLength: 255, description: 'Required when broker_affiliation is true.' })
  @Expose({ name: 'broker_firm_name' })
  @IsOptional()
  @MaxLength(255)
  brokerFirmName?: string;

  @ApiPropertyOptional({ name: 'broker_affiliation_details', maxLength: 255, description: 'Required when broker_affiliation is true.' })
  @Expose({ name: 'broker_affiliation_details' })
  @IsOptional()
  @MaxLength(255)
  brokerAffiliationDetails?: string;

  @ApiPropertyOptional({ name: 'control_person' })
  @Expose({ name: 'control_person' })
  @IsOptional()
  @IsBoolean()
  controlPerson?: boolean;

  @ApiPropertyOptional({ name: 'control_company_name', maxLength: 255, description: 'Required when control_person is true.' })
  @Expose({ name: 'control_company_name' })
  @IsOptional()
  @MaxLength(255)
  controlCompanyName?: string;

  @ApiPropertyOptional({ name: 'control_company_role', maxLength: 255, description: 'Required when control_person is true.' })
  @Expose({ name: 'control_company_role' })
  @IsOptional()
  @MaxLength(255)
  controlCompanyRole?: string;

  @ApiPropertyOptional({ name: 'other_beneficial_owner' })
  @Expose({ name: 'other_beneficial_owner' })
  @IsOptional()
  @IsBoolean()
  otherBeneficialOwner?: boolean;

  @ApiPropertyOptional({ name: 'beneficial_owner_name', maxLength: 255, description: 'Required when other_beneficial_owner is true.' })
  @Expose({ name: 'beneficial_owner_name' })
  @IsOptional()
  @MaxLength(255)
  beneficialOwnerName?: string;

  @ApiPropertyOptional({ name: 'beneficial_owner_relationship', maxLength: 255, description: 'Required when other_beneficial_owner is true.' })
  @Expose({ name: 'beneficial_owner_relationship' })
  @IsOptional()
  @MaxLength(255)
  beneficialOwnerRelationship?: string;

  // ---- ANALYST-only fields below; required only when userRole == ANALYST ----

  @ApiPropertyOptional({ name: 'employee_id', maxLength: 30, description: 'Required when user_role is ANALYST.' })
  @Expose({ name: 'employee_id' })
  @IsOptional()
  @MaxLength(30)
  employeeId?: string;

  @ApiPropertyOptional({ name: 'department', maxLength: 100 })
  @Expose({ name: 'department' })
  @IsOptional()
  @MaxLength(100)
  department?: string;

  @ApiHideProperty()
  @Validate(RegisterRequestBusinessRulesValidator)
  private readonly _businessRules?: unknown;
}
