import { Module } from '@nestjs/common';
import { AuthController } from '../user/auth.controller';
import { RulesController } from '../rules/rules.controller';
import { HealthController } from '../health/health.controller';
import { RegistrationService } from '../onboarding/registration.service';
import { UserService } from '../user/user.service';
import { JwtService } from '../security/jwt.service';
import { RefreshTokenService } from '../security/refresh-token.service';
import { TierService } from '../onboarding/tier.service';
import { AccessTokenGuard } from '../security/access-token.guard';

/**
 * The real controllers with their services stubbed out: enough to generate the
 * OpenAPI document without a database. Used by `npm run docs:openapi` and its test;
 * never served. Add new controllers here too, or they won't appear in openapi.json.
 */
@Module({
  controllers: [AuthController, RulesController, HealthController],
  providers: [
    AccessTokenGuard,
    ...[RegistrationService, UserService, JwtService, RefreshTokenService, TierService].map((provide) => ({
      provide,
      useValue: {},
    })),
  ],
})
export class OpenApiDocsModule {}
