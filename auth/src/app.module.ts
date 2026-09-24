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
import { JwtService } from './security/jwt.service';
import { RefreshTokenService } from './security/refresh-token.service';
import { SsnEncryptionService } from './security/ssn-encryption.service';
import { PasswordEncoderService } from './security/password-encoder.service';
import { SecureTransportMiddleware } from './security/secure-transport.middleware';
import { tlsKeystorePath } from './security/tls';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'db',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'nexttrade',
      username: process.env.DB_APP_USERNAME ?? 'app_user',
      password: process.env.DB_APP_PASSWORD ?? 'my_app_password',
      entities: [User, Session, CustomerProfile, FinancialProfile, Account, AnalystProfile],
      synchronize: false, // schema is owned by the admin/migration role, not this service
      poolSize: 10,
    }),
    TypeOrmModule.forFeature([User, Session, CustomerProfile, FinancialProfile, Account, AnalystProfile]),
  ],
  controllers: [AuthController, HealthController],
  providers: [UserService, RegistrationService, JwtService, RefreshTokenService, SsnEncryptionService, PasswordEncoderService],
})
export class AppModule implements NestModule {
  // Only when this service terminates TLS itself; behind nginx it receives plaintext on the internal network.
  configure(consumer: MiddlewareConsumer): void {
    if (tlsKeystorePath()) {
      consumer.apply(SecureTransportMiddleware).forRoutes('*');
    }
  }
}
