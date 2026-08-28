import {
	Inject,
	Injectable,
	ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";

@Injectable()
export class HealthService {
	constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

	liveness(): { status: "ok" } {
		return { status: "ok" };
	}

	async readiness(): Promise<{ status: "ok" }> {
		try {
			await this.prisma.$queryRaw`SELECT 1`;
			return { status: "ok" };
		} catch {
			throw new ServiceUnavailableException({ status: "error" });
		}
	}
}
