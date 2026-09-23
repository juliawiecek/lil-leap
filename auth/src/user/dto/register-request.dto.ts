import { Expose } from 'class-transformer';
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
import { TraderLevel } from '../../onboarding/enums/trader-level.enum';
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

    if (r.userRole === UserRole.TRADER) {
      if (
        !(
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
        )
      ) {
        this.failureMessage =
          'firstName, lastName, dateOfBirth, phone, streetAddress, city, stateProvince, postalCode, country and citizenshipStatus are required for TRADER registration';
        return false;
      }

      if (!(notBlank(r.accountName) && r.accountType != null && r.traderLevel != null)) {
        this.failureMessage = 'accountName, accountType and traderLevel are required for TRADER registration';
        return false;
      }

      const needsEmploymentDetails =
        r.employmentStatus === EmploymentStatus.EMPLOYED || r.employmentStatus === EmploymentStatus.SELF_EMPLOYED;
      if (needsEmploymentDetails && !(notBlank(r.employerName) && notBlank(r.occupation))) {
        this.failureMessage = 'Employer name and occupation are required for employed or self-employed status';
        return false;
      }
    }

    if (r.userRole === UserRole.ANALYST && !notBlank(r.employeeId)) {
      this.failureMessage = 'employeeId is required for ANALYST registration';
      return false;
    }

    if (r.brokerAffiliation === true && !(notBlank(r.brokerFirmName) && notBlank(r.brokerAffiliationDetails))) {
      this.failureMessage = 'Broker firm name and affiliation details are required when broker affiliation is true';
      return false;
    }

    if (r.controlPerson === true && !(notBlank(r.controlCompanyName) && notBlank(r.controlCompanyRole))) {
      this.failureMessage = 'Control company name and role are required when control person is true';
      return false;
    }

    if (
      r.otherBeneficialOwner === true &&
      !(notBlank(r.beneficialOwnerName) && notBlank(r.beneficialOwnerRelationship))
    ) {
      this.failureMessage = 'Beneficial owner name and relationship are required when other beneficial owner is true';
      return false;
    }

    return true;
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
  @Expose({ name: 'user_role' })
  @IsEnum(UserRole)
  userRole: UserRole;

  @Expose({ name: 'email' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @Expose({ name: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  // ---- TRADER-only fields below; required only when userRole == TRADER ----

  @Expose({ name: 'first_name' })
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @Expose({ name: 'last_name' })
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @Expose({ name: 'date_of_birth' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date_of_birth must be YYYY-MM-DD' })
  dateOfBirth?: string;

  @Expose({ name: 'phone' })
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @Expose({ name: 'street_address' })
  @IsOptional()
  @MaxLength(255)
  streetAddress?: string;

  @Expose({ name: 'apartment' })
  @IsOptional()
  @MaxLength(255)
  apartment?: string;

  @Expose({ name: 'city' })
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @Expose({ name: 'state_province' })
  @IsOptional()
  @MaxLength(100)
  stateProvince?: string;

  @Expose({ name: 'postal_code' })
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @Expose({ name: 'country' })
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @Expose({ name: 'citizenship_status' })
  @IsOptional()
  @IsEnum(CitizenshipStatus)
  citizenshipStatus?: CitizenshipStatus;

  @Expose({ name: 'ssn' })
  @IsOptional()
  @Matches(/^(\d{9}|\d{3}-\d{2}-\d{4})?$/, { message: 'SSN must be 9 digits or 123-45-6789' })
  ssn?: string;

  @Expose({ name: 'employment_status' })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @Expose({ name: 'employer_name' })
  @IsOptional()
  @MaxLength(255)
  employerName?: string;

  @Expose({ name: 'occupation' })
  @IsOptional()
  @MaxLength(100)
  occupation?: string;

  @Expose({ name: 'annual_income' })
  @IsOptional()
  @MaxLength(32)
  annualIncome?: string;

  @Expose({ name: 'net_worth_bracket' })
  @IsOptional()
  @IsEnum(NetWorthBracket)
  netWorthBracket?: NetWorthBracket;

  @Expose({ name: 'risk_profile' })
  @IsOptional()
  @IsEnum(RiskProfile)
  riskProfile?: RiskProfile;

  @Expose({ name: 'liquidity_position' })
  @IsOptional()
  @MaxLength(32)
  liquidityPosition?: string;

  @Expose({ name: 'accredited_investor' })
  @IsOptional()
  @IsBoolean()
  accreditedInvestor?: boolean;

  @Expose({ name: 'account_name' })
  @IsOptional()
  @MaxLength(100)
  accountName?: string;

  @Expose({ name: 'account_type' })
  @IsOptional()
  @IsEnum(AccountType)
  accountType?: AccountType;

  @Expose({ name: 'trader_level' })
  @IsOptional()
  @IsEnum(TraderLevel)
  traderLevel?: TraderLevel;

  @Expose({ name: 'is_politically_exposed_person' })
  @IsOptional()
  @IsBoolean()
  politicallyExposedPerson?: boolean;

  @Expose({ name: 'broker_affiliation' })
  @IsOptional()
  @IsBoolean()
  brokerAffiliation?: boolean;

  @Expose({ name: 'broker_firm_name' })
  @IsOptional()
  @MaxLength(255)
  brokerFirmName?: string;

  @Expose({ name: 'broker_affiliation_details' })
  @IsOptional()
  @MaxLength(255)
  brokerAffiliationDetails?: string;

  @Expose({ name: 'control_person' })
  @IsOptional()
  @IsBoolean()
  controlPerson?: boolean;

  @Expose({ name: 'control_company_name' })
  @IsOptional()
  @MaxLength(255)
  controlCompanyName?: string;

  @Expose({ name: 'control_company_role' })
  @IsOptional()
  @MaxLength(255)
  controlCompanyRole?: string;

  @Expose({ name: 'other_beneficial_owner' })
  @IsOptional()
  @IsBoolean()
  otherBeneficialOwner?: boolean;

  @Expose({ name: 'beneficial_owner_name' })
  @IsOptional()
  @MaxLength(255)
  beneficialOwnerName?: string;

  @Expose({ name: 'beneficial_owner_relationship' })
  @IsOptional()
  @MaxLength(255)
  beneficialOwnerRelationship?: string;

  // ---- ANALYST-only fields below; required only when userRole == ANALYST ----

  @Expose({ name: 'employee_id' })
  @IsOptional()
  @MaxLength(30)
  employeeId?: string;

  @Expose({ name: 'department' })
  @IsOptional()
  @MaxLength(100)
  department?: string;

  @Validate(RegisterRequestBusinessRulesValidator)
  private readonly _businessRules?: unknown;
}
