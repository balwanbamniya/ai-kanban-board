import { Controller, Get, HttpCode, HttpStatus, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
	constructor(
		@Inject(HealthService) private readonly healthService: HealthService,
	) {}

	@Get()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: "Report the API status for compatibility." })
	health(): { status: "ok" } {
		return this.healthService.liveness();
	}

	@Get("live")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: "Report whether the API process is live." })
	liveness(): { status: "ok" } {
		return this.healthService.liveness();
	}

	@Get("ready")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Report whether the API is ready to receive traffic.",
	})
	readiness(): { status: "ok" } {
		return this.healthService.readiness();
	}
}
