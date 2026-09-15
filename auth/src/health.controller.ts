import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

// Excluded from the OpenAPI document itself - it's operational plumbing
// (container readiness checks), not part of the auth service's public
// contract.
@ApiExcludeController()
@Controller()
export class HealthController {
  @Get("health")
  health() {
    return { status: "up" };
  }
}
