import { Repository } from 'typeorm';
import { normalizeEmail, UserService } from './user.service';
import { User } from './entities/user.entity';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';

describe('UserService', () => {
  const user = { userId: 'u1', email: 'trader@example.com', passwordHash: '{bcrypt}hash' } as User;

  let query: { where: jest.Mock; getOne: jest.Mock };
  let manager: { createQueryBuilder: jest.Mock };
  let passwordEncoder: { matches: jest.Mock };
  let service: UserService;

  beforeEach(() => {
    query = { where: jest.fn().mockReturnThis(), getOne: jest.fn() };
    manager = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    passwordEncoder = { matches: jest.fn() };
    service = new UserService(
      { manager } as unknown as Repository<User>,
      passwordEncoder as unknown as PasswordEncoderService,
    );
  });

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
    expect(passwordEncoder.matches).not.toHaveBeenCalled();
  });
});
