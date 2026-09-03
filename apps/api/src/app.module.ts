import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { AccessControlModule } from "./modules/access-control/access-control.module.js";
import { BoardMembersModule } from "./modules/board-members/board-members.module.js";
import { BoardsModule } from "./modules/boards/boards.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { TelemetryLifecycleService } from "./observability/telemetry-lifecycle.service.js";

@Module({
	imports: [
		ConfigModule,
		AccessControlModule,
		BoardMembersModule,
		BoardsModule,
		HealthModule,
		IdentityModule,
	],
	providers: [TelemetryLifecycleService],
})
export class AppModule {}
