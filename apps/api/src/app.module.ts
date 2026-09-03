import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { AccessControlModule } from "./modules/access-control/access-control.module.js";
import { BoardMembersModule } from "./modules/board-members/board-members.module.js";
import { BoardsModule } from "./modules/boards/boards.module.js";
import { ColumnsModule } from "./modules/columns/columns.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { TasksModule } from "./modules/tasks/tasks.module.js";
import { TelemetryLifecycleService } from "./observability/telemetry-lifecycle.service.js";

@Module({
	imports: [
		ConfigModule,
		AccessControlModule,
		BoardMembersModule,
		BoardsModule,
		ColumnsModule,
		HealthModule,
		IdentityModule,
		TasksModule,
	],
	providers: [TelemetryLifecycleService],
})
export class AppModule {}
