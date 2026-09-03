import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AccessControlModule } from "../access-control/access-control.module.js";
import { ColumnsService } from "./application/columns.service.js";
import { ColumnsController } from "./presentation/columns.controller.js";

@Module({
	imports: [DatabaseModule, AccessControlModule],
	controllers: [ColumnsController],
	providers: [ColumnsService],
})
export class ColumnsModule {}
