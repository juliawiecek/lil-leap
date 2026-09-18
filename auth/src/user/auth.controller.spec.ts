import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { UserService } from './user.service';
import { RegistrationService } from '../onboarding/registration.service';
import { JwtService } from '../security/jwt.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { UserRole } from './user-role.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let userService: jest.Mocked<UserService>;
  let registrationService: jest.Mocked<RegistrationService>;
  let jwtService: jest.Mocked<JwtService>;
  let refreshTokenService: jest.Mocked<RefreshTokenService>;

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
        { provide: UserService, useValue: { login: jest.fn() } },
        { provide: RegistrationService, useValue: { register: jest.fn() } },
        { provide: JwtService, useValue: { issueToken: jest.fn() } },
        { provide: RefreshTokenService, useValue: { issue: jest.fn(), rotate: jest.fn() } },
      ],
    }).compile();

    controller = module.get(AuthController);
    userService = module.get(UserService);
    registrationService = module.get(RegistrationService);
    jwtService = module.get(JwtService);
    refreshTokenService = module.get(RefreshTokenService);
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

  it('login propagates InvalidCredentialsException for bad credentials', async () => {
    userService.login.mockRejectedValue(new InvalidCredentialsException('Invalid email or password.'));

    await expect(controller.login({ email: 'trader@example.com', password: 'wrong' } as any)).rejects.toThrow(
      InvalidCredentialsException,
    );
  });

  it('refresh issues a new access token and rotates the refresh token', async () => {
    refreshTokenService.rotate.mockResolvedValue({ user: user as any, newRawRefreshToken: 'new-raw-token' });
    jwtService.issueToken.mockReturnValue('new.access.token');

    const result = await controller.refresh({ refreshToken: 'old-raw-token' } as any);

    expect(refreshTokenService.rotate).toHaveBeenCalledWith('old-raw-token');
    expect(result.accessToken).toBe('new.access.token');
    expect(result.refreshToken).toBe('new-raw-token');
  });
});
