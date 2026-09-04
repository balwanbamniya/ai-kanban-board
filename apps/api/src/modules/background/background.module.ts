import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AccessControlModule } from "../access-control/access-control.module.js";
import { OpenAiProvider } from "../ai/application/openai-provider.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { BackgroundWorker } from "./background.worker.js";
@Module({
	imports: [DatabaseModule, AccessControlModule, RealtimeModule],
	providers: [OpenAiProvider, BackgroundWorker],
})
export class BackgroundModule {}
