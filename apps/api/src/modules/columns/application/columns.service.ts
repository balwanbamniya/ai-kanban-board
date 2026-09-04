import { randomUUID } from "node:crypto";
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { PrismaService } from "../../../database/prisma.service.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { BoardAccessService } from "../../access-control/application/board-access.service.js";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import type { CreateColumnDto } from "../presentation/dto/create-column.dto.js";
import type { DeleteColumnDto } from "../presentation/dto/delete-column.dto.js";
import type { ReorderColumnsDto } from "../presentation/dto/reorder-columns.dto.js";
import type { UpdateColumnDto } from "../presentation/dto/update-column.dto.js";
import { ColumnEventName, recordColumnEvent } from "./column-events.js";

export interface ColumnResponse {
	isCompleted: boolean;
	createdAt: Date;
	id: string;
	sortKey: string;
	title: string;
	updatedAt: Date;
	version: number;
}

@Injectable()
export class ColumnsService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(BoardAccessService)
		private readonly boardAccess: BoardAccessService,
	) {}

	async create(
		context: BoardAccessContext,
		dto: CreateColumnDto,
	): Promise<ColumnResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.COLUMN_CREATE,
		]);

		return this.prisma.$transaction(async (transaction) => {
			await this.boardAccess.assertFreshContext(transaction, context);
			await this.lockActiveBoard(transaction, context.boardId);
			const last = await transaction.column.findFirst({
				where: { boardId: context.boardId },
				orderBy: { sortKey: "desc" },
				select: { sortKey: true },
			});
			const column = await transaction.column.create({
				data: {
					boardId: context.boardId,
					sortKey: generateKeyBetween(last?.sortKey ?? null, null),
					title: dto.title,
					isCompleted: dto.isCompleted ?? false,
				},
			});
			await recordColumnEvent(transaction, {
				actorId: context.userId,
				aggregateId: column.id,
				boardId: context.boardId,
				eventName: ColumnEventName.CREATED,
				message: "Column created",
				payload: {
					columnId: column.id,
					title: column.title,
					isCompleted: column.isCompleted,
				},
			});
			return column;
		});
	}

	async update(
		context: BoardAccessContext,
		columnId: string,
		dto: UpdateColumnDto,
	): Promise<ColumnResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.COLUMN_UPDATE,
		]);

		return this.prisma.$transaction(async (transaction) => {
			await this.boardAccess.assertFreshContext(transaction, context);
			const existing = await transaction.column.findFirst({
				where: { boardId: context.boardId, id: columnId },
				select: { title: true, version: true, isCompleted: true },
			});
			if (!existing) throw new NotFoundException("Column not found.");
			if (existing.version !== dto.version) {
				throw new ConflictException(
					"Column has changed. Refresh and try again.",
				);
			}
			if (
				existing.title === dto.title &&
				(dto.isCompleted === undefined ||
					dto.isCompleted === existing.isCompleted)
			) {
				throw new BadRequestException("Column title is unchanged.");
			}

			const update = await transaction.column.updateMany({
				where: {
					boardId: context.boardId,
					id: columnId,
					version: dto.version,
				},
				data: {
					title: dto.title,
					...(dto.isCompleted === undefined
						? {}
						: { isCompleted: dto.isCompleted }),
					version: { increment: 1 },
				},
			});
			if (update.count !== 1) {
				throw new ConflictException(
					"Column has changed. Refresh and try again.",
				);
			}
			const column = await transaction.column.findUniqueOrThrow({
				where: { id: columnId },
			});
			await recordColumnEvent(transaction, {
				actorId: context.userId,
				aggregateId: column.id,
				boardId: context.boardId,
				eventName: ColumnEventName.UPDATED,
				message: "Column updated",
				payload: {
					columnId: column.id,
					title: column.title,
					isCompleted: column.isCompleted,
				},
			});
			return column;
		});
	}

	async reorder(
		context: BoardAccessContext,
		dto: ReorderColumnsDto,
	): Promise<ColumnResponse[]> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.COLUMN_UPDATE,
		]);

		return this.prisma.$transaction(async (transaction) => {
			await this.boardAccess.assertFreshContext(transaction, context);
			await this.lockActiveBoard(transaction, context.boardId);
			const current = await transaction.column.findMany({
				where: { boardId: context.boardId },
				select: { id: true, version: true },
				orderBy: { sortKey: "asc" },
			});
			const requestedIds = dto.columns.map(({ id }) => id);
			if (
				current.length !== requestedIds.length ||
				new Set(requestedIds).size !== requestedIds.length ||
				current.some(({ id }) => !requestedIds.includes(id))
			) {
				throw new BadRequestException(
					"Reorder requests must contain every board column exactly once.",
				);
			}
			const versions = new Map(
				dto.columns.map(({ id, version }) => [id, version]),
			);
			if (current.some(({ id, version }) => versions.get(id) !== version)) {
				throw new ConflictException(
					"Columns have changed. Refresh and try again.",
				);
			}
			if (current.every(({ id }, index) => id === requestedIds[index])) {
				throw new BadRequestException("Column order is unchanged.");
			}

			for (const { id } of current) {
				await transaction.column.update({
					where: { id },
					data: { sortKey: `~temporary:${randomUUID()}` },
				});
			}
			const sortKeys = generateNKeysBetween(null, null, requestedIds.length);
			for (const [index, id] of requestedIds.entries()) {
				await transaction.column.update({
					where: { id },
					data: { sortKey: sortKeys[index], version: { increment: 1 } },
				});
			}
			await recordColumnEvent(transaction, {
				actorId: context.userId,
				aggregateId: context.boardId,
				boardId: context.boardId,
				eventName: ColumnEventName.REORDERED,
				message: "Columns reordered",
				payload: { columnIds: requestedIds },
			});
			return transaction.column.findMany({
				where: { boardId: context.boardId },
				orderBy: { sortKey: "asc" },
			});
		});
	}

	async delete(
		context: BoardAccessContext,
		columnId: string,
		dto: DeleteColumnDto,
	): Promise<void> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.COLUMN_DELETE,
		]);

		await this.prisma.$transaction(async (transaction) => {
			await this.boardAccess.assertFreshContext(transaction, context);
			await this.lockActiveBoard(transaction, context.boardId);
			const column = await transaction.column.findFirst({
				where: { boardId: context.boardId, id: columnId },
				select: { id: true, title: true, version: true },
			});
			if (!column) throw new NotFoundException("Column not found.");
			if (column.version !== dto.version) {
				throw new ConflictException(
					"Column has changed. Refresh and try again.",
				);
			}

			const tasks = await transaction.task.findMany({
				where: { boardId: context.boardId, columnId },
				orderBy: [{ sortKey: "asc" }, { id: "asc" }],
				select: { id: true },
			});
			if (tasks.length > 0 && !dto.destinationColumnId) {
				throw new BadRequestException(
					"A destinationColumnId is required when deleting a non-empty column.",
				);
			}

			if (dto.destinationColumnId) {
				if (dto.destinationColumnId === columnId) {
					throw new BadRequestException(
						"Destination column must be different.",
					);
				}
				const destination = await transaction.column.findFirst({
					where: {
						boardId: context.boardId,
						id: dto.destinationColumnId,
					},
					select: { id: true },
				});
				if (!destination) {
					throw new BadRequestException(
						"Destination column does not belong to this board.",
					);
				}
				let lastKey =
					(
						await transaction.task.findFirst({
							where: { columnId: destination.id },
							orderBy: { sortKey: "desc" },
							select: { sortKey: true },
						})
					)?.sortKey ?? null;
				for (const task of tasks) {
					lastKey = generateKeyBetween(lastKey, null);
					await transaction.task.update({
						where: { id: task.id },
						data: {
							columnId: destination.id,
							sortKey: lastKey,
							version: { increment: 1 },
						},
					});
				}
			}

			await transaction.column.delete({ where: { id: columnId } });
			await recordColumnEvent(transaction, {
				actorId: context.userId,
				aggregateId: column.id,
				boardId: context.boardId,
				eventName: ColumnEventName.DELETED,
				message: "Column deleted",
				payload: {
					columnId: column.id,
					destinationColumnId: dto.destinationColumnId ?? null,
					movedTaskCount: tasks.length,
					title: column.title,
				},
			});
		});
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
