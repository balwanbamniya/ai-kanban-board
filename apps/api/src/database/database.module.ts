import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { PrismaService } from "./prisma.service.js";

@Module({
	imports: [ConfigModule],
	providers: [PrismaService],
	exports: [PrismaService],
})
export class DatabaseModule {}
