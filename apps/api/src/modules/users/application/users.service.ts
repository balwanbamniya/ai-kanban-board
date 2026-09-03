import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";

export interface UserSummary {
	avatarUrl?: string;
	email: string;
	id: string;
	name: string;
}

@Injectable()
export class UsersService {
	constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

	async resolveByEmail(email: string): Promise<UserSummary | null> {
		const user = await this.prisma.user.findFirst({
			where: { deletedAt: null, email: email.toLowerCase() },
			select: { avatarUrl: true, email: true, id: true, name: true },
		});
		if (!user?.email) {
			return null;
		}
		return {
			avatarUrl: user.avatarUrl ?? undefined,
			email: user.email,
			id: user.id,
			name: user.name,
		};
	}
}
