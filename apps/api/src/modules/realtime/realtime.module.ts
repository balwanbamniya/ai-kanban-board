import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { RealtimeGateway } from "./realtime.gateway.js";
import { RealtimeRedisService } from "./realtime-redis.service.js";
import { RedisPresenceService } from "./redis-presence.service.js";

@Module({
	imports: [AccessControlModule, IdentityModule],
	providers: [RealtimeGateway, RealtimeRedisService, RedisPresenceService],
	exports: [RealtimeGateway, RealtimeRedisService],
})
export class RealtimeModule {}
