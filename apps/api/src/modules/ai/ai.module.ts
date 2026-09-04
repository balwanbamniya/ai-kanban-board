import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AccessControlModule } from "../access-control/access-control.module.js";
import { AiApplicationService } from "./application/ai-application.service.js";
import { AiRunsService } from "./application/ai-runs.service.js";
import { AiController } from "./presentation/ai.controller.js";

@Module({
	imports: [DatabaseModule, AccessControlModule],
	controllers: [AiController],
	providers: [AiRunsService, AiApplicationService],
})
export class AiModule {}
