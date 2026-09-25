import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

/** Liveness endpoint -- no dependencies, so it stays green if Postgres is briefly unreachable. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe (no database check)' })
  @ApiOkResponse({
    schema: {
      properties: { status: { example: 'ok' }, service: { example: 'auth' }, timestamp: { format: 'date-time' } },
    },
  })
  check(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'auth',
      timestamp: new Date().toISOString(),
    };
  }
}
