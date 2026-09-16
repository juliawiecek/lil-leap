import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

/** Liveness endpoint -- no dependencies, so it stays green if Postgres is briefly unreachable. */
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
    };
  }
}
