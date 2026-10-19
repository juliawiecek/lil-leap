import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginRequestDto } from './dto/login-request.dto';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { CustomerProfile } from '../onboarding/entities/customer-profile.entity';
import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILURES } from '../security/login-policy';

// A valid, cost-10 bcrypt hash to perform equivalent password work for unknown emails.
// This is not an account credential; a successful comparison can never authenticate anyone.
const DUMMY_PASSWORD_HASH = '{bcrypt}$2a$10$nT/WFgkARwpRvUrlujVtBuo6Erodiz8hfdbIMiJWlLg4cbzNW56.K';

/** Emails are stored and compared trimmed and lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    private readonly passwordEncoder: PasswordEncoderService,
  ) {}

  /** Case-insensitive lookup; pass a transaction's manager to read inside that transaction. */
  findByEmail(email: string, manager: EntityManager = this.userRepository.manager): Promise<User | null> {
    return manager
      .createQueryBuilder(User, 'user')
      .where('LOWER(user.email) = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  /**
   * Serializes password checks and counter updates per account, including across service
   * instances. A failed login must commit its counter before returning the generic 401.
   */
  async login(request: LoginRequestDto): Promise<User> {
    const authenticated = await this.userRepository.manager.transaction(async (manager) => {
      const user = await manager.createQueryBuilder(User, 'user')
        .where('LOWER(user.email) = :email', { email: normalizeEmail(request.email) })
        .setLock('pessimistic_write')
        .getOne();
      // Do the bcrypt work even for unknown emails and locked accounts. The response is
      // also identical: neither the lock state nor account existence is disclosed.
      const matches = this.passwordEncoder.matches(request.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (!user) {
        return null;
      }
      const now = Date.now();
      if (user.lockedUntil && user.lockedUntil.getTime() > now) {
        return null; // Attempts during the lock neither authenticate nor extend its deadline.
      }
      const failures = user.lockedUntil ? 0 : user.failedLoginAttempts;
      if (matches) {
        await manager.update(User, { userId: user.userId }, { failedLoginAttempts: 0, lockedUntil: null });
        return user;
      }
      const attempts = Math.min(failures + 1, LOGIN_MAX_FAILURES);
      await manager.update(User, { userId: user.userId }, {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= LOGIN_MAX_FAILURES ? new Date(now + LOGIN_LOCK_MINUTES * 60_000) : null,
      });
      return null;
    });
    // Throw outside the transaction; throwing inside would roll back failed-attempt updates.
    if (!authenticated) {
      throw new InvalidCredentialsException();
    }
    return authenticated;
  }

  /** Loads the identity/contact profile for one user; callers must enforce authorization before calling this method. */
  findProfileByUserId(userId: string): Promise<CustomerProfile | null> {
    return this.customerProfileRepository.findOne({ where: { user: { userId } }, relations: { user: true } });
  }
}
