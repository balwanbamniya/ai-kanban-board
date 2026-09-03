import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { generateKeyBetween } from "fractional-indexing";
import { PrismaService } from "../../../database/prisma.service.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { TaskPriority } from "../../../generated/prisma/enums.js";
import { BoardAccessService } from "../../access-control/application/board-access.service.js";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import type { CreateTaskDto } from "../presentation/dto/create-task.dto.js";
import type { ListTasksQueryDto } from "../presentation/dto/list-tasks-query.dto.js";
import type { MoveTaskDto } from "../presentation/dto/move-task.dto.js";
import type { UpdateTaskDto } from "../presentation/dto/update-task.dto.js";
import { recordTaskEvent, TaskEventName } from "./task-events.js";

const taskInclude = {
	assignee: {
		select: { avatarUrl: true, email: true, id: true, name: true },
	},
} as const;

export type TaskResponse = Prisma.TaskGetPayload<{
	include: typeof taskInclude;
}>;

@Injectable()
export class TasksService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(BoardAccessService)
		private readonly boardAccess: BoardAccessService,
	) {}

	async list(
		context: BoardAccessContext,
		query: ListTasksQueryDto,
	): Promise<{ tasks: TaskResponse[]; nextCursor: string | null }> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.BOARD_READ,
		]);
		if (query.cursor) {
			const cursor = await this.prisma.task.findFirst({
				where: { boardId: context.boardId, id: query.cursor },
				select: { id: true },
			});
			if (!cursor) {
				throw new BadRequestException(
					"Task cursor does not belong to this board.",
				);
			}
		}
		const where: Prisma.TaskWhereInput = {
			boardId: context.boardId,
			assigneeId: query.assigneeId,
			columnId: query.columnId,
			priority: query.priority,
		};
		const tasks = await this.prisma.task.findMany({
			where,
			orderBy: [{ sortKey: "asc" }, { id: "asc" }],
			cursor: query.cursor ? { id: query.cursor } : undefined,
			skip: query.cursor ? 1 : undefined,
			take: query.limit + 1,
			include: taskInclude,
		});
		const hasNextPage = tasks.length > query.limit;
		const page = hasNextPage ? tasks.slice(0, query.limit) : tasks;
		return {
			tasks: page,
			nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
		};
	}

	async create(
		context: BoardAccessContext,
		dto: CreateTaskDto,
	): Promise<TaskResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.TASK_CREATE,
		]);
		return this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			await this.assertReferences(transaction, context.boardId, dto);
			const last = await transaction.task.findFirst({
				where: { columnId: dto.columnId },
				orderBy: { sortKey: "desc" },
				select: { sortKey: true },
			});
			const task = await transaction.task.create({
				data: {
					assigneeId: dto.assigneeId ?? null,
					boardId: context.boardId,
					columnId: dto.columnId,
					creatorId: context.userId,
					description: dto.description ?? null,
					dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
					parentTaskId: dto.parentTaskId ?? null,
					priority: dto.priority ?? TaskPriority.MEDIUM,
					sortKey: generateKeyBetween(last?.sortKey ?? null, null),
					title: dto.title,
				},
				include: taskInclude,
			});
			await recordTaskEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: TaskEventName.CREATED,
				message: "Task created",
				payload: {
					columnId: task.columnId,
					taskId: task.id,
					title: task.title,
				},
				taskId: task.id,
			});
			return task;
		});
	}

	async update(
		context: BoardAccessContext,
		taskId: string,
		dto: UpdateTaskDto,
	): Promise<TaskResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.TASK_UPDATE,
		]);
		const changedFields = (
			[
				"assigneeId",
				"description",
				"dueDate",
				"parentTaskId",
				"priority",
				"title",
			] as const
		).filter((field) => dto[field] !== undefined);
		if (changedFields.length === 0) {
			throw new BadRequestException(
				"Provide at least one task property to update.",
			);
		}

		return this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			const existing = await transaction.task.findFirst({
				where: { boardId: context.boardId, id: taskId },
			});
			if (!existing) throw new NotFoundException("Task not found.");
			if (existing.version !== dto.version) {
				throw new ConflictException("Task has changed. Refresh and try again.");
			}
			const unchanged = changedFields.every((field) => {
				switch (field) {
					case "assigneeId":
					case "description":
					case "parentTaskId":
					case "priority":
					case "title":
						return existing[field] === dto[field];
					case "dueDate":
						return (
							(existing.dueDate?.getTime() ?? null) ===
							(dto.dueDate ? new Date(dto.dueDate).getTime() : null)
						);
				}
				return false;
			});
			if (unchanged) {
				throw new BadRequestException("Task properties are unchanged.");
			}
			if (dto.assigneeId !== undefined) {
				await this.assertAssignee(transaction, context.boardId, dto.assigneeId);
			}
			if (dto.parentTaskId !== undefined) {
				await this.assertParent(
					transaction,
					context.boardId,
					taskId,
					dto.parentTaskId,
				);
			}

			const data: Prisma.TaskUpdateManyMutationInput = {
				...(dto.assigneeId === undefined ? {} : { assigneeId: dto.assigneeId }),
				...(dto.description === undefined
					? {}
					: { description: dto.description }),
				...(dto.dueDate === undefined
					? {}
					: { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
				...(dto.parentTaskId === undefined
					? {}
					: { parentTaskId: dto.parentTaskId }),
				...(dto.priority === undefined ? {} : { priority: dto.priority }),
				...(dto.title === undefined ? {} : { title: dto.title }),
				version: { increment: 1 },
			};
			const update = await transaction.task.updateMany({
				where: { boardId: context.boardId, id: taskId, version: dto.version },
				data,
			});
			if (update.count !== 1) {
				throw new ConflictException("Task has changed. Refresh and try again.");
			}
			const task = await transaction.task.findUniqueOrThrow({
				where: { id: taskId },
				include: taskInclude,
			});
			await recordTaskEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: TaskEventName.UPDATED,
				message: "Task updated",
				payload: { changedFields, taskId },
				taskId,
			});
			return task;
		});
	}

	async move(
		context: BoardAccessContext,
		taskId: string,
		dto: MoveTaskDto,
	): Promise<TaskResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.TASK_MOVE,
		]);
		return this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			const existing = await transaction.task.findFirst({
				where: { boardId: context.boardId, id: taskId },
			});
			if (!existing) throw new NotFoundException("Task not found.");
			if (existing.version !== dto.version) {
				throw new ConflictException("Task has changed. Refresh and try again.");
			}
			const destination = await transaction.column.findFirst({
				where: { boardId: context.boardId, id: dto.columnId },
				select: { id: true },
			});
			if (!destination) {
				throw new BadRequestException(
					"Destination column does not belong to this board.",
				);
			}
			if (existing.columnId === destination.id) {
				const laterTask = await transaction.task.findFirst({
					where: {
						columnId: destination.id,
						id: { not: taskId },
						sortKey: { gt: existing.sortKey },
					},
					select: { id: true },
				});
				if (!laterTask) {
					throw new BadRequestException("Task is already last in this column.");
				}
			}
			const last = await transaction.task.findFirst({
				where: { columnId: destination.id, id: { not: taskId } },
				orderBy: { sortKey: "desc" },
				select: { id: true, sortKey: true },
			});
			const sortKey = generateKeyBetween(last?.sortKey ?? null, null);
			const update = await transaction.task.updateMany({
				where: { boardId: context.boardId, id: taskId, version: dto.version },
				data: {
					columnId: destination.id,
					sortKey,
					version: { increment: 1 },
				},
			});
			if (update.count !== 1) {
				throw new ConflictException("Task has changed. Refresh and try again.");
			}
			const task = await transaction.task.findUniqueOrThrow({
				where: { id: taskId },
				include: taskInclude,
			});
			await recordTaskEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: TaskEventName.MOVED,
				message: "Task moved",
				payload: {
					fromColumnId: existing.columnId,
					taskId,
					toColumnId: destination.id,
				},
				taskId,
			});
			return task;
		});
	}

	async delete(
		context: BoardAccessContext,
		taskId: string,
		version: number,
	): Promise<void> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.TASK_DELETE,
		]);
		await this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			const task = await transaction.task.findFirst({
				where: { boardId: context.boardId, id: taskId },
				select: { columnId: true, title: true, version: true },
			});
			if (!task) throw new NotFoundException("Task not found.");
			if (task.version !== version) {
				throw new ConflictException("Task has changed. Refresh and try again.");
			}
			const deleted = await transaction.task.deleteMany({
				where: { boardId: context.boardId, id: taskId, version },
			});
			if (deleted.count !== 1) {
				throw new ConflictException("Task has changed. Refresh and try again.");
			}
			await recordTaskEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: TaskEventName.DELETED,
				message: "Task deleted",
				payload: { columnId: task.columnId, taskId, title: task.title },
				taskId,
			});
		});
	}

	private async assertReferences(
		transaction: Prisma.TransactionClient,
		boardId: string,
		dto: Pick<CreateTaskDto, "assigneeId" | "columnId" | "parentTaskId">,
	): Promise<void> {
		const column = await transaction.column.findFirst({
			where: { boardId, id: dto.columnId },
			select: { id: true },
		});
		if (!column) {
			throw new BadRequestException("Column does not belong to this board.");
		}
		await this.assertAssignee(transaction, boardId, dto.assigneeId);
		await this.assertParent(transaction, boardId, undefined, dto.parentTaskId);
	}

	private async assertAssignee(
		transaction: Prisma.TransactionClient,
		boardId: string,
		assigneeId?: string | null,
	): Promise<void> {
		if (!assigneeId) return;
		const assignee = await transaction.user.findFirst({
			where: {
				deletedAt: null,
				id: assigneeId,
				OR: [
					{ ownedBoards: { some: { id: boardId } } },
					{ memberships: { some: { boardId } } },
				],
			},
			select: { id: true },
		});
		if (!assignee) {
			throw new BadRequestException(
				"Assignee must be an active board participant.",
			);
		}
	}

	private async assertParent(
		transaction: Prisma.TransactionClient,
		boardId: string,
		taskId?: string,
		parentTaskId?: string | null,
	): Promise<void> {
		if (!parentTaskId) return;
		let candidate: string | null = parentTaskId;
		const visited = new Set<string>();
		while (candidate) {
			if (candidate === taskId || visited.has(candidate)) {
				throw new BadRequestException(
					"Task parent relationships cannot cycle.",
				);
			}
			visited.add(candidate);
			const parent: { parentTaskId: string | null } | null =
				await transaction.task.findFirst({
					where: { boardId, id: candidate },
					select: { parentTaskId: true },
				});
			if (!parent) {
				throw new BadRequestException(
					"Parent task does not belong to this board.",
				);
			}
			candidate = parent.parentTaskId;
		}
	}

	private async lockActiveBoard(
		transaction: Prisma.TransactionClient,
		boardId: string,
	): Promise<void> {
		const rows = await transaction.$queryRaw<
			Array<{ archivedAt: Date | null }>
		>(
			Prisma.sql`
				SELECT "archived_at" AS "archivedAt"
				FROM "boards"
				WHERE "id" = CAST(${boardId} AS uuid)
				FOR UPDATE
			`,
		);
		const board = rows[0];
		if (!board) throw new NotFoundException("Board not found.");
		if (board.archivedAt) {
			throw new ConflictException("Archived boards are read-only.");
		}
	}
}
