import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { TelemetryLifecycleService } from "./observability/telemetry-lifecycle.service.js";

@Module({
	imports: [ConfigModule, HealthModule, IdentityModule],
	providers: [TelemetryLifecycleService],
})
export class AppModule {}
