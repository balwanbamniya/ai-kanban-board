import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { BoardAccessService } from "../../access-control/application/board-access.service.js";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import type { ListActivityQueryDto } from "../presentation/dto/list-activity-query.dto.js";

const activityInclude = {
	actor: { select: { avatarUrl: true, id: true, name: true } },
} as const;

export type ActivityResponse = Prisma.ActivityGetPayload<{
	include: typeof activityInclude;
}>;

@Injectable()
export class ActivityService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(BoardAccessService)
		private readonly boardAccess: BoardAccessService,
	) {}

	async list(
		context: BoardAccessContext,
		query: ListActivityQueryDto,
	): Promise<{
		activities: ActivityResponse[];
		nextCursor: string | null;
	}> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.ACTIVITY_READ,
		]);
		if (query.cursor) {
			const cursor = await this.prisma.activity.findFirst({
				where: { boardId: context.boardId, id: query.cursor },
				select: { id: true },
			});
			if (!cursor) {
				throw new BadRequestException(
					"Activity cursor does not belong to this board.",
				);
			}
		}

		const activities = await this.prisma.activity.findMany({
			where: { boardId: context.boardId },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			cursor: query.cursor ? { id: query.cursor } : undefined,
			skip: query.cursor ? 1 : undefined,
			take: query.limit + 1,
			include: activityInclude,
		});
		const hasNextPage = activities.length > query.limit;
		const page = hasNextPage ? activities.slice(0, query.limit) : activities;
		return {
			activities: page,
			nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
		};
	}
}
