import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
	liveness(): { status: "ok" } {
		return { status: "ok" };
	}

	readiness(): { status: "ok" } {
		return { status: "ok" };
	}
}
