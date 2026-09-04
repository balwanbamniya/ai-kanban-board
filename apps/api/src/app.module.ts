import { Module } from "@nestjs/common";
import { ProblemDetailsFilter } from "./common/filters/problem-details.filter.js";
import { RequestContextMiddleware } from "./common/request-context/request-context.middleware.js";
import { RequestContextService } from "./common/request-context/request-context.service.js";
import { ConfigModule } from "./config/config.module.js";
import { AccessControlModule } from "./modules/access-control/access-control.module.js";
import { ActivityModule } from "./modules/activity/activity.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { BackgroundModule } from "./modules/background/background.module.js";
import { BoardMembersModule } from "./modules/board-members/board-members.module.js";
import { BoardsModule } from "./modules/boards/boards.module.js";
import { ColumnsModule } from "./modules/columns/columns.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";
import { TasksModule } from "./modules/tasks/tasks.module.js";
import { TelemetryLifecycleService } from "./observability/telemetry-lifecycle.service.js";

@Module({
	imports: [
		BackgroundModule,
		ConfigModule,
		AccessControlModule,
		ActivityModule,
		AiModule,
		BoardMembersModule,
		BoardsModule,
		ColumnsModule,
		HealthModule,
		IdentityModule,
		RealtimeModule,
		TasksModule,
	],
	providers: [
		TelemetryLifecycleService,
		ProblemDetailsFilter,

		RequestContextMiddleware,
		RequestContextService,
	],
})
export class AppModule {}
