import {
	Inject,
	Injectable,
	ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { RealtimeRedisService } from "../realtime/realtime-redis.service.js";

@Injectable()
export class HealthService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(RealtimeRedisService) private readonly redis: RealtimeRedisService,
	) {}

	liveness(): { status: "ok" } {
		return { status: "ok" };
	}

	async readiness(): Promise<{ status: "ok" }> {
		try {
			await Promise.all([
				this.prisma.$queryRaw`SELECT 1`,
				this.redis.command.ping(),
			]);
			return { status: "ok" };
		} catch {
			throw new ServiceUnavailableException({ status: "error" });
		}
	}
}
