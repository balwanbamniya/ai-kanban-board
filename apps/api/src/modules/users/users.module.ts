import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UserSyncService } from "./application/user-sync.service.js";
import { UsersService } from "./application/users.service.js";
import { UsersController } from "./presentation/users.controller.js";

@Module({
	imports: [DatabaseModule],
	controllers: [UsersController],
	providers: [UsersService, UserSyncService],
	exports: [UserSyncService],
})
export class UsersModule {}
