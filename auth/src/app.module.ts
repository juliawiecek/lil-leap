import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user/entities/user.entity';
import { Session } from './security/entities/session.entity';
import { CustomerProfile } from './onboarding/entities/customer-profile.entity';
import { FinancialProfile } from './onboarding/entities/financial-profile.entity';
import { Account } from './onboarding/entities/account.entity';
import { AnalystProfile } from './onboarding/entities/analyst-profile.entity';
import { AuthController } from './user/auth.controller';
import { HealthController } from './health/health.controller';
import { UserService } from './user/user.service';
import { RegistrationService } from './onboarding/registration.service';
import { TierService } from './onboarding/tier.service';
import { RulesController } from './rules/rules.controller';
import { JwtService } from './security/jwt.service';
import { RefreshTokenService } from './security/refresh-token.service';
import { SsnEncryptionService } from './security/ssn-encryption.service';
import { PasswordEncoderService } from './security/password-encoder.service';
import { SecureTransportMiddleware } from './security/secure-transport.middleware';
import { AccessTokenGuard } from './security/access-token.guard';
import { tlsKeystorePath } from './security/tls';
import { PasswordResetToken } from './password-reset/entities/password-reset-token.entity';
import { PasswordResetController } from './password-reset/password-reset.controller';
import { PasswordResetService } from './password-reset/password-reset.service';
import { mailDeliveryProvider } from './mail/mail-delivery.provider';
import { AccountSettingsController } from './account-settings/account-settings.controller';
import { AccountSettingsService } from './account-settings/account-settings.service';
import { PasswordExpiryService } from './password-expiry/password-expiry.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'db',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'nexttrade',
      username: process.env.DB_APP_USERNAME ?? 'app_user',
      password: requiredEnv('DB_APP_PASSWORD'),
      entities: [User, Session, CustomerProfile, FinancialProfile, Account, AnalystProfile, PasswordResetToken],
      synchronize: false, // schema is owned by the admin/migration role, not this service
      poolSize: 10,
    }),
    TypeOrmModule.forFeature([User, Session, CustomerProfile, FinancialProfile, Account, AnalystProfile, PasswordResetToken]),
  ],
  controllers: [AuthController, PasswordResetController, AccountSettingsController, RulesController, HealthController],
  providers: [
    UserService,
    RegistrationService,
    TierService,
    JwtService,
    RefreshTokenService,
    SsnEncryptionService,
    PasswordEncoderService,
    AccessTokenGuard,
    PasswordResetService,
    AccountSettingsService,
    PasswordExpiryService,
    // MAIL_DELIVERY=outbox (default, the VM) writes .eml files; smtp sends to Mailpit on dev laptops.
    mailDeliveryProvider,
  ],
})
export class AppModule implements NestModule {
  // Only when this service terminates TLS itself; behind nginx it receives plaintext on the internal network.
  configure(consumer: MiddlewareConsumer): void {
    if (tlsKeystorePath()) {
      consumer.apply(SecureTransportMiddleware).forRoutes('*');
    }
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set before starting the service.`);
  }
  return value;
}
