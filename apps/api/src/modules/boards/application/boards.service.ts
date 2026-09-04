import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { BoardRole as PersistedBoardRole } from "../../../generated/prisma/enums.js";
import { BoardAccessService } from "../../access-control/application/board-access.service.js";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import { BoardRole } from "../../access-control/domain/board-role.enum.js";
import type { CreateBoardDto } from "../presentation/dto/create-board.dto.js";
import type { ListBoardsQueryDto } from "../presentation/dto/list-boards-query.dto.js";
import type { UpdateBoardDto } from "../presentation/dto/update-board.dto.js";
import { BoardEventName, recordBoardEvent } from "./board-events.js";

const DEFAULT_BOARD_COLOR = "#6366f1";
const DEFAULT_COLUMNS = [
	{ title: "Todo", sortKey: "a0" },
	{ title: "In Progress", sortKey: "a1" },
	{ title: "Review", sortKey: "a2" },
	{ title: "Done", sortKey: "a3", isCompleted: true },
] as const;

type BoardRecord = {
	archivedAt: Date | null;
	color: string;
	createdAt: Date;
	description: string | null;
	id: string;
	ownerId: string;
	title: string;
	updatedAt: Date;
	version: number;
};

export interface BoardResponse extends BoardRecord {
	role: BoardRole;
}

export interface BoardListItem extends BoardResponse {
	memberCount: number;
	taskCount: number;
}

export interface BoardMemberResponse {
	avatarUrl: string | null;
	email: string | null;
	id: string;
	joinedAt: Date;
	name: string;
	role: BoardRole;
}

export interface BoardDetailResponse {
	board: BoardListItem;
	columns: Array<{
		isCompleted: boolean;
		taskCount: number;
		createdAt: Date;
		id: string;
		sortKey: string;
		title: string;
		updatedAt: Date;
		version: number;
	}>;
	members: BoardMemberResponse[];
}

@Injectable()
export class BoardsService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(BoardAccessService)
		private readonly boardAccess: BoardAccessService,
	) {}

	async list(
		userId: string,
		query: ListBoardsQueryDto,
	): Promise<{ boards: BoardListItem[]; nextCursor: string | null }> {
		if (query.cursor) {
			const cursor = await this.prisma.board.findFirst({
				where: {
					id: query.cursor,
					archivedAt: query.includeArchived ? undefined : null,
					OR: [{ ownerId: userId }, { members: { some: { userId } } }],
				},
				select: { id: true },
			});
			if (!cursor)
				throw new BadRequestException(
					"Board cursor is unavailable for this query.",
				);
		}
		const boards = await this.prisma.board.findMany({
			where: {
				archivedAt: query.includeArchived ? undefined : null,
				OR: [{ ownerId: userId }, { members: { some: { userId } } }],
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			cursor: query.cursor ? { id: query.cursor } : undefined,
			skip: query.cursor ? 1 : undefined,
			take: query.limit + 1,
			include: {
				columns: { select: { _count: { select: { tasks: true } } } },
				members: { where: { userId }, select: { role: true } },
				_count: { select: { members: true } },
			},
		});
		const hasNextPage = boards.length > query.limit;
		const page = hasNextPage ? boards.slice(0, query.limit) : boards;

		return {
			boards: page.map((board) => ({
				...this.toBoardResponse(board, this.roleFor(board, userId)),
				memberCount: board._count.members + 1,
				taskCount: board.columns.reduce(
					(count, column) => count + column._count.tasks,
					0,
				),
			})),
			nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
		};
	}

	async create(userId: string, dto: CreateBoardDto): Promise<BoardResponse> {
		return this.prisma.$transaction(async (transaction) => {
			const board = await transaction.board.create({
				data: {
					color: dto.color ?? DEFAULT_BOARD_COLOR,
					description: dto.description ?? null,
					ownerId: userId,
					title: dto.title,
				},
			});
			await transaction.column.createMany({
				data: DEFAULT_COLUMNS.map((column) => ({
					...column,
					boardId: board.id,
				})),
			});
			await recordBoardEvent(transaction, {
				actorId: userId,
				boardId: board.id,
				eventName: BoardEventName.CREATED,
				message: "Board created",
				payload: { boardId: board.id },
			});
			return this.toBoardResponse(board, BoardRole.OWNER);
		});
	}

	async detail(context: BoardAccessContext): Promise<BoardDetailResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.BOARD_READ,
		]);
		const board = await this.prisma.board.findUnique({
			where: { id: context.boardId },
			include: {
				columns: {
					orderBy: { sortKey: "asc" },
					include: { _count: { select: { tasks: true } } },
				},
				members: {
					orderBy: { joinedAt: "asc" },
					include: {
						user: {
							select: {
								avatarUrl: true,
								email: true,
								id: true,
								name: true,
							},
						},
					},
				},
				owner: {
					select: { avatarUrl: true, email: true, id: true, name: true },
				},
				_count: { select: { members: true } },
			},
		});
		if (!board) {
			throw new NotFoundException("Board not found.");
		}
		const taskCount = board.columns.reduce(
			(count, column) => count + column._count.tasks,
			0,
		);

		return {
			board: {
				...this.toBoardResponse(board, context.role),
				memberCount: board._count.members + 1,
				taskCount,
			},
			columns: board.columns.map(
				({
					createdAt,
					id,
					sortKey,
					title,
					updatedAt,
					version,
					isCompleted,
					_count,
				}) => ({
					createdAt,
					isCompleted,
					taskCount: _count.tasks,
					id,
					sortKey,
					title,
					updatedAt,
					version,
				}),
			),
			members: [
				{
					...board.owner,
					joinedAt: board.createdAt,
					role: BoardRole.OWNER,
				},
				...board.members.map(({ joinedAt, role, user }) => ({
					...user,
					joinedAt,
					role: this.boardAccess.toBoardRole(role),
				})),
			],
		};
	}

	async update(
		context: BoardAccessContext,
		dto: UpdateBoardDto,
	): Promise<BoardResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.BOARD_UPDATE,
		]);
		const changedFields = (["title", "description", "color"] as const).filter(
			(field) => dto[field] !== undefined,
		);
		if (changedFields.length === 0) {
			throw new BadRequestException(
				"Provide at least one board property to update.",
			);
		}

		return this.prisma.$transaction(async (transaction) => {
			await this.boardAccess.assertFreshContext(transaction, context);
			const result = await transaction.board.updateMany({
				where: {
					archivedAt: null,
					id: context.boardId,
					version: dto.version,
				},
				data: {
					...(dto.color === undefined ? {} : { color: dto.color }),
					...(dto.description === undefined
						? {}
						: { description: dto.description }),
					...(dto.title === undefined ? {} : { title: dto.title }),
					version: { increment: 1 },
				},
			});
			if (result.count !== 1) {
				throw new ConflictException(
					"Board has changed or is archived. Refresh and try again.",
				);
			}
			const board = await transaction.board.findUniqueOrThrow({
				where: { id: context.boardId },
			});
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: BoardEventName.UPDATED,
				message: "Board updated",
				payload: { boardId: context.boardId, changedFields },
			});
			return this.toBoardResponse(board, context.role);
		});
	}

	async archive(
		context: BoardAccessContext,
		version: number,
	): Promise<BoardResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.BOARD_ARCHIVE,
		]);
		return this.setArchivedState(context, version, true);
	}

	async restore(
		context: BoardAccessContext,
		version: number,
	): Promise<BoardResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.BOARD_RESTORE,
		]);
		if (!context.archivedAt) {
			throw new ConflictException("Board is not archived.");
		}
		return this.setArchivedState(context, version, false);
	}

	private async setArchivedState(
		context: BoardAccessContext,
		version: number,
		archive: boolean,
	): Promise<BoardResponse> {
		return this.prisma.$transaction(async (transaction) => {
			await this.boardAccess.assertFreshContext(transaction, context);
			const result = await transaction.board.updateMany({
				where: {
					archivedAt: archive ? null : { not: null },
					id: context.boardId,
					ownerId: context.userId,
					version,
				},
				data: {
					archivedAt: archive ? new Date() : null,
					version: { increment: 1 },
				},
			});
			if (result.count !== 1) {
				throw new ConflictException(
					`Board has changed or is already ${archive ? "archived" : "active"}.`,
				);
			}
			const board = await transaction.board.findUniqueOrThrow({
				where: { id: context.boardId },
			});
			await recordBoardEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: archive ? BoardEventName.ARCHIVED : BoardEventName.RESTORED,
				message: archive ? "Board archived" : "Board restored",
				payload: { boardId: context.boardId },
			});
			return this.toBoardResponse(board, context.role);
		});
	}

	private roleFor(
		board: {
			ownerId: string;
			members: Array<{ role: PersistedBoardRole }>;
		},
		userId: string,
	): BoardRole {
		if (board.ownerId === userId) {
			return BoardRole.OWNER;
		}
		const membership = board.members[0];
		if (!membership) {
			throw new NotFoundException("Board membership not found.");
		}
		return this.boardAccess.toBoardRole(membership.role);
	}

	private toBoardResponse(board: BoardRecord, role: BoardRole): BoardResponse {
		return {
			archivedAt: board.archivedAt,
			color: board.color,
			createdAt: board.createdAt,
			description: board.description,
			id: board.id,
			ownerId: board.ownerId,
			role,
			title: board.title,
			updatedAt: board.updatedAt,
			version: board.version,
		};
	}
}
