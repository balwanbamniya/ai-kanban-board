import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AccessControlModule } from "../access-control/access-control.module.js";
import { BoardMembersService } from "./application/board-members.service.js";
import { BoardMembersController } from "./presentation/board-members.controller.js";

@Module({
	imports: [DatabaseModule, AccessControlModule],
	controllers: [BoardMembersController],
	providers: [BoardMembersService],
})
export class BoardMembersModule {}
