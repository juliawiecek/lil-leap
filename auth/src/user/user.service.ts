import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginRequestDto } from './dto/login-request.dto';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { PasswordEncoderService } from '../security/password-encoder.service';

/** Emails are stored and compared trimmed and lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly passwordEncoder: PasswordEncoderService,
  ) {}

  /** Case-insensitive lookup; pass a transaction's manager to read inside that transaction. */
  findByEmail(email: string, manager: EntityManager = this.userRepository.manager): Promise<User | null> {
    return manager
      .createQueryBuilder(User, 'user')
      .where('LOWER(user.email) = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  /** An unknown email and a wrong password fail identically, to avoid leaking which emails are registered. */
  async login(request: LoginRequestDto): Promise<User> {
    const user = await this.findByEmail(request.email);

    if (!user || !this.passwordEncoder.matches(request.password, user.passwordHash)) {
      throw new InvalidCredentialsException();
    }

    return user;
  }
}
