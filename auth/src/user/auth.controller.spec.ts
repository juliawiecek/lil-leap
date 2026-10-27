import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { UserService } from './user.service';
import { RegistrationService } from '../onboarding/registration.service';
import { JwtService } from '../security/jwt.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { TierService } from '../onboarding/tier.service';
import { PasswordExpiryService } from '../password-expiry/password-expiry.service';
import { PasswordExpiredException } from './exceptions/password-expired.exception';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { UserRole } from './user-role.enum';
import { ProfileAccessDeniedException } from './exceptions/profile-access-denied.exception';
import { ProfileNotFoundException } from './exceptions/profile-not-found.exception';
import { InvalidRefreshTokenException } from './exceptions/invalid-refresh-token.exception';

describe('AuthController', () => {
  let controller: AuthController;
  let userService: jest.Mocked<UserService>;
  let registrationService: jest.Mocked<RegistrationService>;
  let jwtService: jest.Mocked<JwtService>;
  let refreshTokenService: jest.Mocked<RefreshTokenService>;
  let tierService: jest.Mocked<TierService>;
  let passwordExpiry: jest.Mocked<PasswordExpiryService>;

  const user = {
    userId: '11111111-1111-1111-1111-111111111111',
    email: 'trader@example.com',
    passwordHash: '{bcrypt}$2a$10$abc',
    userRole: 'TRADER' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: UserService, useValue: { login: jest.fn(), findProfileByUserId: jest.fn() } },
        { provide: RegistrationService, useValue: { register: jest.fn() } },
        { provide: JwtService, useValue: { issueToken: jest.fn() } },
        { provide: RefreshTokenService, useValue: { issue: jest.fn(), rotate: jest.fn(), revoke: jest.fn() } },
        {
          provide: TierService,
          useValue: {
            findTraderLevel: jest.fn().mockResolvedValue('ADVANCED'),
            findRiskProfile: jest.fn().mockResolvedValue('MODERATE'),
          },
        },
        { provide: PasswordExpiryService, useValue: { handleExpiredSignIn: jest.fn() } },
      ],
    }).compile();

    controller = module.get(AuthController);
    userService = module.get(UserService);
    registrationService = module.get(RegistrationService);
    jwtService = module.get(JwtService);
    refreshTokenService = module.get(RefreshTokenService);
    tierService = module.get(TierService);
    passwordExpiry = module.get(PasswordExpiryService);
  });

  it('register returns the created user without any tokens', async () => {
    registrationService.register.mockResolvedValue(user as any);

    const result = await controller.register({ userRole: UserRole.ANALYST } as any);

    expect(result).toEqual({
      id: user.userId,
      email: user.email,
      userRole: user.userRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    expect((result as any).accessToken).toBeUndefined();
  });

  it('login issues an access token and a refresh token on success', async () => {
    userService.login.mockResolvedValue(user as any);
    jwtService.issueToken.mockReturnValue('access.jwt.token');
    refreshTokenService.issue.mockResolvedValue('raw-refresh-token');

    const result = await controller.login({ email: 'trader@example.com', password: 'hunter2' } as any);

    expect(result.accessToken).toBe('access.jwt.token');
    expect(result.refreshToken).toBe('raw-refresh-token');
    expect(result.user.email).toBe(user.email);
  });

  it('login puts the account tier from the accounts table into the access token', async () => {
    refreshTokenService.issue.mockResolvedValue('raw-refresh-token');
    userService.login.mockResolvedValue(user as any);

    await controller.login({ email: 'trader@example.com', password: 'hunter2' } as any);

    expect(tierService.findTraderLevel).toHaveBeenCalledWith(user.userId);
    expect(tierService.findRiskProfile).toHaveBeenCalledWith(user.userId);
    expect(jwtService.issueToken).toHaveBeenCalledWith(user.userId, user.email, 'ADVANCED', UserRole.TRADER, 'MODERATE', expect.anything());
  });

  it('login issues a token without a tier for a user with no account', async () => {
    userService.login.mockResolvedValue({ ...user, userRole: 'ANALYST' } as any);
    tierService.findTraderLevel.mockResolvedValue(null);
    tierService.findRiskProfile.mockResolvedValue(null);
    refreshTokenService.issue.mockResolvedValue('raw-refresh-token');

    await controller.login({ email: 'trader@example.com', password: 'hunter2' } as any);

    expect(jwtService.issueToken).toHaveBeenCalledWith(user.userId, user.email, null, UserRole.ANALYST, null, expect.anything());
  });

  it('login propagates InvalidCredentialsException for bad credentials', async () => {
    userService.login.mockRejectedValue(new InvalidCredentialsException('Invalid email or password.'));

    await expect(controller.login({ email: 'trader@example.com', password: 'wrong' } as any)).rejects.toThrow(
      InvalidCredentialsException,
    );
  });

  it('login with an expired password emails a reset link, issues no tokens and reports PASSWORD_EXPIRED', async () => {
    userService.login.mockRejectedValue(new PasswordExpiredException(user.userId, user.email));

    await expect(controller.login({ email: user.email, password: 'right-but-old' } as any)).rejects.toThrow(PasswordExpiredException);
    expect(passwordExpiry.handleExpiredSignIn).toHaveBeenCalledWith(user.userId, user.email);
    expect(jwtService.issueToken).not.toHaveBeenCalled();
    expect(refreshTokenService.issue).not.toHaveBeenCalled();
  });

  it('login with bad credentials sends no reset link', async () => {
    userService.login.mockRejectedValue(new InvalidCredentialsException());
    await expect(controller.login({ email: user.email, password: 'wrong' } as any)).rejects.toThrow(InvalidCredentialsException);
    expect(passwordExpiry.handleExpiredSignIn).not.toHaveBeenCalled();
  });

  it('refresh issues a new access token and rotates the refresh token', async () => {
    refreshTokenService.rotate.mockResolvedValue({ user: user as any, newRawRefreshToken: 'new-raw-token' });
    jwtService.issueToken.mockReturnValue('new.access.token');

    const result = await controller.refresh({ refreshToken: 'old-raw-token' } as any);

    expect(refreshTokenService.rotate).toHaveBeenCalledWith('old-raw-token');
    expect(result.accessToken).toBe('new.access.token');
    expect(result.refreshToken).toBe('new-raw-token');
    expect(jwtService.issueToken).toHaveBeenCalledWith(user.userId, user.email, 'ADVANCED', UserRole.TRADER, 'MODERATE', expect.anything());
  });

  it('logout revokes the given refresh token', async () => {
    refreshTokenService.revoke.mockResolvedValue(undefined);

    await expect(controller.logout({ refreshToken: 'raw-refresh-token' } as any)).resolves.toBeUndefined();

    expect(refreshTokenService.revoke).toHaveBeenCalledWith('raw-refresh-token');
  });

  it('returns only the authenticated user profile fields', async () => {
    userService.findProfileByUserId.mockResolvedValue({
      user: user as any,
      firstName: 'Ada',
      lastName: 'Lovelace',
      address: '1 Main St',
      phone: '555-0100',
      ssnEncrypted: Buffer.from('sensitive'),
      dateOfBirth: '1815-12-10',
    } as any);

    const result = await controller.profile(user.userId, { userId: user.userId } as any);

    expect(result).toEqual({
      id: user.userId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      address: '1 Main St',
      email: user.email,
      phone: '555-0100',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('ssnEncrypted');
    expect(result).not.toHaveProperty('dateOfBirth');
  });

  it('denies a request for another user profile before reading the database', async () => {
    await expect(controller.profile('22222222-2222-2222-2222-222222222222', { userId: user.userId } as any)).rejects.toThrow(
      ProfileAccessDeniedException,
    );

    expect(userService.findProfileByUserId).not.toHaveBeenCalled();
  });

  it('throws ProfileNotFoundException when the authenticated user has no profile row', async () => {
    userService.findProfileByUserId.mockResolvedValue(null);

    await expect(controller.profile(user.userId, { userId: user.userId } as any)).rejects.toThrow(ProfileNotFoundException);

    expect(userService.findProfileByUserId).toHaveBeenCalledWith(user.userId);
  });

  it('refresh re-reads the tier so a tier change shows up in the new access token', async () => {
    refreshTokenService.rotate.mockResolvedValue({ user: user as any, newRawRefreshToken: 'new-raw-token' });
    tierService.findTraderLevel.mockResolvedValue('NOVICE' as any);
    tierService.findRiskProfile.mockResolvedValue(null);

    await controller.refresh({ refreshToken: 'old-raw-token' } as any);

    expect(jwtService.issueToken).toHaveBeenCalledWith(user.userId, user.email, 'NOVICE', UserRole.TRADER, null, 'new-raw-token');
  });

  it('refresh issues no access token when the refresh token is rejected', async () => {
    refreshTokenService.rotate.mockRejectedValue(new InvalidRefreshTokenException());

    await expect(controller.refresh({ refreshToken: 'reused-token' } as any)).rejects.toThrow(InvalidRefreshTokenException);

    expect(tierService.findTraderLevel).not.toHaveBeenCalled();
    expect(jwtService.issueToken).not.toHaveBeenCalled();
  });

  it('login issues no tokens when credentials are rejected', async () => {
    userService.login.mockRejectedValue(new InvalidCredentialsException('Invalid email or password.'));

    await expect(controller.login({ email: 'trader@example.com', password: 'wrong' } as any)).rejects.toThrow();

    expect(jwtService.issueToken).not.toHaveBeenCalled();
    expect(refreshTokenService.issue).not.toHaveBeenCalled();
  });
});
