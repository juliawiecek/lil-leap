import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RegistrationService } from './registration.service';
import { UserService } from '../user/user.service';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { SsnEncryptionService } from '../security/ssn-encryption.service';
import { UserAlreadyExistsException } from '../user/exceptions/user-already-exists.exception';
import { RegisterRequestDto } from '../user/dto/register-request.dto';
import { UserRole } from '../user/user-role.enum';

/** A date of birth `years` ago today. */
const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
};

const trader = (overrides: Partial<RegisterRequestDto> = {}): RegisterRequestDto =>
  ({
    userRole: UserRole.TRADER,
    email: ' Ada@Example.com ',
    password: 'correct-horse-9',
    firstName: ' Ada ',
    lastName: ' Lovelace ',
    dateOfBirth: yearsAgo(30),
    phone: ' 555-0100 ',
    streetAddress: '1 Main St',
    apartment: ' ',
    city: 'Springfield',
    stateProvince: 'IL',
    postalCode: '62701',
    country: ' US ',
    citizenshipStatus: 'CITIZEN',
    ssn: '123-45-6789',
    employmentStatus: 'RETIRED',
    annualIncome: '50,000',
    netWorthBracket: '$25k-100k',
    riskProfile: 'MODERATE',
    liquidityPosition: '10,000',
    accreditedInvestor: false,
    politicallyExposedPerson: false,
    brokerAffiliation: true,
    brokerFirmName: ' Firm ',
    accountName: ' Main ',
    accountType: 'INDIVIDUAL_CASH',
    traderLevel: 'NOVICE',
    ...overrides,
  }) as unknown as RegisterRequestDto;

describe('RegistrationService', () => {
  let saved: Array<Record<string, any>>;
  let manager: { create: jest.Mock; save: jest.Mock };
  let userService: { findByEmail: jest.Mock };
  let ssn: { encrypt: jest.Mock };
  let service: RegistrationService;

  /** The saved row created for the given entity class name. */
  const savedAs = (entity: string) => saved.find((row) => row.__entity === entity)!;

  beforeEach(() => {
    saved = [];
    manager = {
      create: jest.fn((entity, fields) => ({ __entity: entity.name, ...fields })),
      save: jest.fn(async (row) => {
        saved.push(row);
        return row;
      }),
    };
    userService = { findByEmail: jest.fn().mockResolvedValue(null) };
    ssn = { encrypt: jest.fn().mockResolvedValue(Buffer.from('cipher')) };
    const dataSource = { transaction: jest.fn((work) => work(manager)) };

    service = new RegistrationService(
      userService as unknown as UserService,
      { encode: (raw: string) => `{bcrypt}hash-of-${raw}` } as PasswordEncoderService,
      ssn as unknown as SsnEncryptionService,
      dataSource as unknown as DataSource,
    );
  });

  it('rejects an email that is already registered, inside the transaction', async () => {
    userService.findByEmail.mockResolvedValue({ userId: 'existing' });

    await expect(service.register(trader())).rejects.toThrow(UserAlreadyExistsException);
    expect(userService.findByEmail).toHaveBeenCalledWith(' Ada@Example.com ', manager);
    expect(saved).toHaveLength(0);
  });

  it('registers an ANALYST: user + analyst profile only', async () => {
    const user = await service.register({
      userRole: UserRole.ANALYST,
      email: 'Analyst@Example.com',
      password: 'pw-123456',
      employeeId: ' E-1 ',
      department: '  ',
    } as RegisterRequestDto);

    expect(user).toMatchObject({ email: 'analyst@example.com', passwordHash: '{bcrypt}hash-of-pw-123456', userRole: 'ANALYST' });
    expect(saved.map((row) => row.__entity)).toEqual(['User', 'AnalystProfile']);
    expect(savedAs('AnalystProfile')).toMatchObject({ employeeId: 'E-1', department: null });
    expect(ssn.encrypt).not.toHaveBeenCalled();
  });

  it('registers a TRADER: user, customer profile, financial profile and account', async () => {
    await service.register(trader());

    expect(saved.map((row) => row.__entity)).toEqual(['User', 'CustomerProfile', 'FinancialProfile', 'Account']);
    expect(ssn.encrypt).toHaveBeenCalledWith('123456789');
    expect(savedAs('CustomerProfile')).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '555-0100',
      country: 'US',
      address: '1 Main St, Springfield, IL, 62701',
      ssnEncrypted: Buffer.from('cipher'),
    });
    expect(savedAs('FinancialProfile')).toMatchObject({
      annualIncome: '50000',
      liquidityPosition: '10000',
      employerName: null,
      fundsSourceVerified: false,
      regulatoryDisclosures: { brokerAffiliation: true, brokerFirmName: 'Firm', controlPerson: false, controlCompanyName: '' },
      beneficialOwnerInfo: { otherBeneficialOwner: false, beneficialOwnerName: '' },
    });
    expect(savedAs('Account')).toMatchObject({ accountName: 'Main', minBalanceRequirement: '5000.00' });
    expect(savedAs('Account').accountNumber).toMatch(/^NT[0-9A-F]{12}$/);
  });

  it('includes the apartment in the address when given', async () => {
    await service.register(trader({ apartment: ' 4B ' }));

    expect(savedAs('CustomerProfile').address).toBe('1 Main St, 4B, Springfield, IL, 62701');
  });

  it('sets the ADVANCED minimum balance', async () => {
    await service.register(trader({ traderLevel: 'ADVANCED' } as Partial<RegisterRequestDto>));

    expect(savedAs('Account').minBalanceRequirement).toBe('100000.00');
  });

  it('rejects a TRADER under 21', async () => {
    await expect(service.register(trader({ dateOfBirth: yearsAgo(20) }))).rejects.toThrow(BadRequestException);
    expect(ssn.encrypt).not.toHaveBeenCalled();
  });

  it('rejects an invalid date of birth', async () => {
    await expect(service.register(trader({ dateOfBirth: 'not-a-date' }))).rejects.toThrow(BadRequestException);
  });

  it('rejects a TRADER without an SSN', async () => {
    await expect(service.register(trader({ ssn: '  ' }))).rejects.toThrow('SSN is required');
  });
});
