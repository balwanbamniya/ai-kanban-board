import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AccessControlModule } from "../access-control/access-control.module.js";
import { BoardsService } from "./application/boards.service.js";
import { BoardsController } from "./presentation/boards.controller.js";

@Module({
	imports: [DatabaseModule, AccessControlModule],
	controllers: [BoardsController],
	providers: [BoardsService],
})
export class BoardsModule {}
