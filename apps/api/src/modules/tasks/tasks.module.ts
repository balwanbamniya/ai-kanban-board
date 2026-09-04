import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AccessControlModule } from "../access-control/access-control.module.js";
import { TasksService } from "./application/tasks.service.js";
import { CrossBoardTasksController } from "./presentation/cross-board-tasks.controller.js";
import { TasksController } from "./presentation/tasks.controller.js";

@Module({
	imports: [DatabaseModule, AccessControlModule],
	controllers: [TasksController, CrossBoardTasksController],
	providers: [TasksService],
})
export class TasksModule {}
