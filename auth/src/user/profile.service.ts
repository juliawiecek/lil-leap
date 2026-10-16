import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { CustomerProfile } from '../onboarding/entities/customer-profile.entity';
import { PasswordEncoderService } from '../security/password-encoder.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { User } from './entities/user.entity';
import { normalizeEmail } from './user.service';
import { UserAlreadyExistsException } from './exceptions/user-already-exists.exception';
import { ChangeEmailRequestDto } from './dto/change-email-request.dto';
import { ChangePasswordRequestDto } from './dto/change-password-request.dto';
import { UpdateProfileRequestDto } from './dto/update-profile-request.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(CustomerProfile) private readonly profileRepository: Repository<CustomerProfile>,
    private readonly passwordEncoder: PasswordEncoderService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async getProfile(userId: string): Promise<CustomerProfile> {
    const profile = await this.profileRepository.findOne({ where: { user: { userId } } });
    if (!profile) { throw new InvalidCredentialsException(); }
    return profile;
  }

  async updateProfile(userId: string, request: UpdateProfileRequestDto): Promise<CustomerProfile> {
    return this.dataSource.transaction(async manager => {
      const profile = await this.requireProfile(userId, manager);
      if (request.phone !== undefined) { profile.phone = request.phone.trim(); }
      if (request.address !== undefined) { profile.address = request.address.trim(); }
      const saved = await manager.save(CustomerProfile, profile);
      await this.audit(manager, userId, 'PROFILE_UPDATED');
      return saved;
    });
  }

  async changeEmail(userId: string, request: ChangeEmailRequestDto): Promise<User> {
    return this.dataSource.transaction(async manager => {
      const user = await this.requireUser(userId, manager);
      this.requireCurrentPassword(user, request.currentPassword);
      user.email = normalizeEmail(request.email);
      try {
        const saved = await manager.save(User, user);
        await this.audit(manager, userId, 'EMAIL_CHANGED');
        await this.refreshTokenService.revokeAllForUser(userId, manager);
        return saved;
      } catch (error) {
        if (error instanceof QueryFailedError && (error as any).driverError?.code === '23505') {
          throw new UserAlreadyExistsException();
        }
        throw error;
      }
    });
  }

  async changePassword(userId: string, request: ChangePasswordRequestDto): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const user = await this.requireUser(userId, manager);
      this.requireCurrentPassword(user, request.currentPassword);
      await manager.update(User, { userId }, { passwordHash: this.passwordEncoder.encode(request.newPassword) });
      await this.audit(manager, userId, 'PASSWORD_CHANGED');
      await this.refreshTokenService.revokeAllForUser(userId, manager);
    });
  }

  private async requireUser(userId: string, manager: EntityManager): Promise<User> {
    const user = await manager.findOne(User, { where: { userId } });
    if (!user) { throw new InvalidCredentialsException(); }
    return user;
  }

  private async requireProfile(userId: string, manager: EntityManager): Promise<CustomerProfile> {
    const profile = await manager.findOne(CustomerProfile, { where: { user: { userId } } });
    if (!profile) { throw new InvalidCredentialsException(); }
    return profile;
  }

  private requireCurrentPassword(user: User, password: string): void {
    if (!this.passwordEncoder.matches(password, user.passwordHash)) { throw new InvalidCredentialsException(); }
  }

  private async audit(manager: EntityManager, userId: string, eventType: string): Promise<void> {
    await manager.query(
      `INSERT INTO audit_log (user_id, actor_type, event_type, payload) VALUES ($1, 'USER', $2, '{}'::jsonb)`,
      [userId, eventType],
    );
  }
}