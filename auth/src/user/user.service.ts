import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginRequestDto } from './dto/login-request.dto';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { PasswordEncoderService } from '../security/password-encoder.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly passwordEncoder: PasswordEncoderService,
  ) {}

  /** An unknown email and a wrong password fail identically, to avoid leaking which emails are registered. */
  async login(request: LoginRequestDto): Promise<User> {
    const normalizedEmail = request.email.trim().toLowerCase();

    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email: normalizedEmail })
      .getOne();

    if (!user) {
      throw new InvalidCredentialsException('Invalid email or password.');
    }

    if (!this.passwordEncoder.matches(request.password, user.passwordHash)) {
      throw new InvalidCredentialsException('Invalid email or password.');
    }

    return user;
  }
}
