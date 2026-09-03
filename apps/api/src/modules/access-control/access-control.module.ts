import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { BoardAccessService } from "./application/board-access.service.js";
import { BoardAuthorizationPolicy } from "./application/board-authorization.policy.js";
import { BoardPoliciesGuard } from "./presentation/board-policies.guard.js";

@Module({
	imports: [DatabaseModule],
	providers: [BoardAccessService, BoardAuthorizationPolicy, BoardPoliciesGuard],
	exports: [BoardAccessService, BoardAuthorizationPolicy, BoardPoliciesGuard],
})
export class AccessControlModule {}
