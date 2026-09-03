import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AccessControlModule } from "../access-control/access-control.module.js";
import { ActivityService } from "./application/activity.service.js";
import { ActivityController } from "./presentation/activity.controller.js";

@Module({
	imports: [DatabaseModule, AccessControlModule],
	controllers: [ActivityController],
	providers: [ActivityService],
})
export class ActivityModule {}
