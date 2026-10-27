import { Repository } from 'typeorm';
import { normalizeEmail, UserService } from './user.service';
import { User } from './entities/user.entity';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { CustomerProfile } from '../onboarding/entities/customer-profile.entity';
import { INVALID_SIGN_IN_MESSAGE, LOGIN_LOCK_MINUTES } from '../security/login-policy';
import { PASSWORD_MAX_AGE_DAYS } from '../security/password-policy';
import { PasswordExpiredException } from './exceptions/password-expired.exception';

describe('UserService', () => {
  let user: User;

  let query: { where: jest.Mock; setLock: jest.Mock; getOne: jest.Mock };
  let manager: { createQueryBuilder: jest.Mock; transaction: jest.Mock; update: jest.Mock };
  let passwordEncoder: { matches: jest.Mock };
  let customerProfileRepository: { findOne: jest.Mock };
  let service: UserService;
  let committed: boolean;

  beforeEach(() => {
    customerProfileRepository = { findOne: jest.fn() };
    jest.useFakeTimers().setSystemTime(new Date('2026-10-19T12:00:00Z'));
    user = { userId: 'u1', email: 'trader@example.com', passwordHash: '{bcrypt}hash', userStatus: 'ACTIVE',
      failedLoginAttempts: 0, lockedUntil: null, passwordChangedAt: new Date('2026-10-01T00:00:00Z'),
      passwordExpiryWarnedAt: null } as User;
    committed = false;
    query = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn() };
    query.getOne.mockResolvedValue(user);
    manager = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      update: jest.fn(async (_entity, _where, patch) => { Object.assign(user, patch); return { affected: 1 }; }),
      transaction: jest.fn(async work => { const result = await work(manager); committed = true; return result; }),
    };
    passwordEncoder = { matches: jest.fn().mockReturnValue(true) };
    service = new UserService(
      { manager } as unknown as Repository<User>,
      customerProfileRepository as unknown as Repository<CustomerProfile>,
      passwordEncoder as unknown as PasswordEncoderService,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('normalizeEmail trims and lower-cases', () => {
    expect(normalizeEmail('  Trader@Example.COM ')).toBe('trader@example.com');
  });

  it('findByEmail looks the email up case-insensitively', async () => {
    query.getOne.mockResolvedValue(user);

    await expect(service.findByEmail(' TRADER@example.com')).resolves.toBe(user);
    expect(query.where).toHaveBeenCalledWith('LOWER(user.email) = :email', { email: 'trader@example.com' });
  });

  it('findByEmail uses the transaction manager it is given', async () => {
    const txQuery = { where: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) };
    const txManager = { createQueryBuilder: jest.fn().mockReturnValue(txQuery) };

    await service.findByEmail('a@example.com', txManager as any);

    expect(txManager.createQueryBuilder).toHaveBeenCalled();
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('login returns the user when the password matches', async () => {
    query.getOne.mockResolvedValue(user);
    passwordEncoder.matches.mockReturnValue(true);

    await expect(service.login({ email: user.email, password: 'right' })).resolves.toBe(user);
    expect(passwordEncoder.matches).toHaveBeenCalledWith('right', user.passwordHash);
  });

  it('login rejects a wrong password', async () => {
    query.getOne.mockResolvedValue(user);
    passwordEncoder.matches.mockReturnValue(false);

    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow(InvalidCredentialsException);
  });

  it('login rejects an unknown email with the same error', async () => {
    query.getOne.mockResolvedValue(null);

    await expect(service.login({ email: 'nobody@example.com', password: 'x' })).rejects.toThrow(
      InvalidCredentialsException,
    );
    expect(passwordEncoder.matches).toHaveBeenCalledWith('x', expect.stringMatching(/^\{bcrypt\}\$2a\$10\$/));
    expect(manager.update).not.toHaveBeenCalled();
  });

  it.each(['DISABLED', 'DELETED'] as const)('rejects a %s user with the unknown-email error, even with the right password', async status => {
    user.userStatus = status;
    user.failedLoginAttempts = 1;

    await expect(service.login({ email: user.email, password: 'right' })).rejects.toThrow(INVALID_SIGN_IN_MESSAGE);
    expect(passwordEncoder.matches).toHaveBeenCalledTimes(1);
    expect(manager.update).not.toHaveBeenCalled();
    expect(user.failedLoginAttempts).toBe(1);
  });

  it('serializes normalized email checks with a database row lock', async () => {
    await service.login({ email: ' TRADER@EXAMPLE.COM ', password: 'right' });
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(query.where).toHaveBeenCalledWith('LOWER(user.email) = :email', { email: user.email });
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('counts three consecutive failures and commits the 15-minute lock before rejecting', async () => {
    passwordEncoder.matches.mockReturnValue(false);
    for (let i = 1; i <= 3; i++) {
      committed = false;
      await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow(INVALID_SIGN_IN_MESSAGE);
      expect(committed).toBe(true);
      expect(user.failedLoginAttempts).toBe(i);
      expect(user.lockedUntil).toEqual(i === 3 ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : null);
    }
  });

  it.each([false, true])('rejects a locked account even when password matches=%s, without extending the lock', async matches => {
    user.failedLoginAttempts = 3;
    user.lockedUntil = new Date(Date.now() + 60_000);
    passwordEncoder.matches.mockReturnValue(matches);
    const deadline = user.lockedUntil;
    await expect(service.login({ email: user.email, password: 'password' })).rejects.toThrow(INVALID_SIGN_IN_MESSAGE);
    expect(manager.update).not.toHaveBeenCalled();
    expect(user.lockedUntil).toBe(deadline);
    expect(passwordEncoder.matches).toHaveBeenCalledTimes(1);
  });

  it('a successful login clears prior failures and starts a new failure streak', async () => {
    user.failedLoginAttempts = 2;
    await service.login({ email: user.email, password: 'right' });
    expect(manager.update).toHaveBeenCalledWith(User, { userId: user.userId }, { failedLoginAttempts: 0, lockedUntil: null });
    passwordEncoder.matches.mockReturnValue(false);
    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow(InvalidCredentialsException);
    expect(user.failedLoginAttempts).toBe(1);
    expect(user.lockedUntil).toBeNull();
  });

  it('the lock expires exactly at its deadline and correct credentials reset the account', async () => {
    user.failedLoginAttempts = 3;
    user.lockedUntil = new Date(Date.now() + 15 * 60_000);
    jest.advanceTimersByTime(15 * 60_000 - 1);
    await expect(service.login({ email: user.email, password: 'right' })).rejects.toThrow(InvalidCredentialsException);
    jest.advanceTimersByTime(1);
    await expect(service.login({ email: user.email, password: 'right' })).resolves.toBe(user);
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it('an incorrect password after expiry starts at one failure rather than immediately relocking', async () => {
    user.failedLoginAttempts = 3;
    user.lockedUntil = new Date(Date.now() - 1);
    passwordEncoder.matches.mockReturnValue(false);
    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow(InvalidCredentialsException);
    expect(user.failedLoginAttempts).toBe(1);
    expect(user.lockedUntil).toBeNull();
  });

  it('refuses a correct password once it is older than the maximum age, after clearing the failure count', async () => {
    user.passwordChangedAt = new Date(Date.now() - PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60_000);
    user.failedLoginAttempts = 2;

    const attempt = service.login({ email: user.email, password: 'right' });
    await expect(attempt).rejects.toThrow(PasswordExpiredException);
    await expect(attempt).rejects.toMatchObject({ code: 'PASSWORD_EXPIRED', userId: 'u1', email: user.email });
    expect(committed).toBe(true);
    expect(user.failedLoginAttempts).toBe(0);
  });

  it('a wrong password for an expired account is still just a bad credential, and never says the password expired', async () => {
    user.passwordChangedAt = new Date(Date.now() - 400 * 24 * 60 * 60_000);
    passwordEncoder.matches.mockReturnValue(false);
    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow(InvalidCredentialsException);
    expect(user.failedLoginAttempts).toBe(1);
  });

  it('a password one millisecond short of the maximum age still signs in', async () => {
    user.passwordChangedAt = new Date(Date.now() - PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60_000 + 1);
    await expect(service.login({ email: user.email, password: 'right' })).resolves.toBe(user);
  });

  it('propagates a persistence failure instead of reporting a successful login', async () => {
    manager.update.mockRejectedValue(new Error('database unavailable'));
    await expect(service.login({ email: user.email, password: 'right' })).rejects.toThrow('database unavailable');
    expect(committed).toBe(false);
  });

  it('findProfileByUserId scopes the lookup to the user id and loads the user email', async () => {
    const profile = { user: { userId: 'u1', email: user.email } } as CustomerProfile;
    customerProfileRepository.findOne.mockResolvedValue(profile);

    await expect(service.findProfileByUserId('u1')).resolves.toBe(profile);
    expect(customerProfileRepository.findOne).toHaveBeenCalledWith({
      where: { user: { userId: 'u1' } },
      relations: { user: true },
    });
  });
});
