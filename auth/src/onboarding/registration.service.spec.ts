import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrationService } from './registration.service';
import { RegisterRequestDto } from '../user/dto/register-request.dto';
import { UserRole } from '../user/user-role.enum';
import { CustomerProfile } from './entities/customer-profile.entity';
import { FinancialProfile } from './entities/financial-profile.entity';

describe('normalized trader registration', () => {
  const payload = {
    user_role: 'TRADER', email: 'CLIENT@example.test', password: 'Password123!',
    first_name: 'Test', last_name: 'Client', date_of_birth: '2005-09-22', phone: '555-0100',
    street_address: '1 Test Way', city: 'Test City', state_province: 'TX', postal_code: '12345',
    country: 'US', citizenship_status: 'CITIZEN', ssn: '111-22-3333',
    account_name: 'Trading', account_type: 'INDIVIDUAL_CASH', trader_level: 'NOVICE',
  };

  const manager = {
    createQueryBuilder: jest.fn(), create: jest.fn(), save: jest.fn(),
  };
  const transaction = jest.fn();
  let service: RegistrationService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-22T12:00:00Z'));
    jest.clearAllMocks();
    manager.createQueryBuilder.mockReturnValue({ where: () => ({ getOne: async () => null }) });
    manager.create.mockImplementation((entity, values) => Object.assign(new entity(), values));
    manager.save.mockImplementation(async (entity) => entity);
    transaction.mockImplementation(async (callback) => callback(manager));
    service = new RegistrationService(
      {} as any, {} as any, {} as any, {} as any, {} as any,
      { encode: () => 'test-password-hash' } as any,
      { encrypt: async () => Buffer.from('test-ciphertext') } as any,
      { transaction } as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('accepts the existing snake_case contract without full KYC', async () => {
    const request = plainToInstance(RegisterRequestDto, payload);
    expect(await validate(request)).toEqual([]);
    expect(request.userRole).toBe(UserRole.TRADER);
    await service.register(request);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(4);
    expect(manager.create).toHaveBeenCalledWith(CustomerProfile, expect.objectContaining({
      dateOfBirth: '2005-09-22', citizenshipStatus: 'CITIZEN', ssnEncrypted: Buffer.from('test-ciphertext'),
    }));
    expect(manager.create).toHaveBeenCalledWith(FinancialProfile, expect.objectContaining({
      accreditedInvestor: false, fundsSourceVerified: false,
    }));
  });

  it.each(['2005-09-23', '2008-09-22', '2026-09-23'])('rejects underage or future DOB %s', async (dob) => {
    const request = plainToInstance(RegisterRequestDto, { ...payload, date_of_birth: dob });
    await expect(service.register(request)).rejects.toThrow(BadRequestException);
    expect(manager.create).not.toHaveBeenCalledWith(CustomerProfile, expect.anything());
  });

  it.each(['2008-02-30', '2005-09-22T00:00:00Z'])('rejects non-date or invalid calendar DOB %s', async (dob) => {
    const request = plainToInstance(RegisterRequestDto, { ...payload, date_of_birth: dob });
    expect((await validate(request)).length).toBeGreaterThan(0);
  });

  it('propagates a profile failure out of the transaction callback', async () => {
    manager.save.mockImplementation(async (entity) => {
      if (entity instanceof FinancialProfile) throw new Error('financial insert failed');
      return entity;
    });
    await expect(service.register(plainToInstance(RegisterRequestDto, payload))).rejects.toThrow('financial insert failed');
    expect(manager.save).toHaveBeenCalledTimes(3);
  });
});
