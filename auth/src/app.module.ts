import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { HealthController } from "./health.controller";

@Module({
  controllers: [AuthController, HealthController],
  providers: [AuthService],
})
export class AppModule {}
