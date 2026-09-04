import { isDeepStrictEqual } from "node:util";
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { generateKeyBetween } from "fractional-indexing";
import { PrismaService } from "../../../database/prisma.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { BoardAccessService } from "../../access-control/application/board-access.service.js";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import {
	recordTaskEvent,
	TaskEventName,
} from "../../tasks/application/task-events.js";
import type {
	ApplyAiRunDto,
	ApplyAiRunResponseDto,
} from "../presentation/dto/apply-ai-run.dto.js";
import { taskSuggestions } from "./ai-schemas.js";
@Injectable()
export class AiApplicationService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(BoardAccessService) private readonly access: BoardAccessService,
	) {}
	async apply(
		context: BoardAccessContext,
		runId: string,
		dto: ApplyAiRunDto,
	): Promise<ApplyAiRunResponseDto> {
		this.access.assertContextPermissions(context, [
			BoardPermission.AI_RUN,
			BoardPermission.TASK_CREATE,
		]);
		return this.prisma.$transaction(async (tx) => {
			await this.access.assertFreshContext(tx, context);
			const run = await tx.aiRun.findFirst({
				where: { id: runId, boardId: context.boardId },
			});
			if (!run) throw new NotFoundException("AI run not found.");
			if (run.status !== "SUCCEEDED" || run.operationKind !== "TASK_GENERATION")
				throw new ConflictException(
					"Only successful task-generation runs can be applied.",
				);
			const input = {
				columnId: dto.columnId,
				suggestionIndexes: [...dto.suggestionIndexes].sort((a, b) => a - b),
			};
			const previous = await tx.aiApplication.findUnique({
				where: {
					runId_idempotencyKey: { runId, idempotencyKey: dto.idempotencyKey },
				},
			});
			if (previous) {
				if (
					previous.actorId !== context.userId ||
					!isDeepStrictEqual(previous.input, input)
				)
					throw new ConflictException("Idempotency key is already used.");
				return previous.result as unknown as ApplyAiRunResponseDto;
			}
			const parsed = taskSuggestions.safeParse(run.output);
			if (!parsed.success)
				throw new ConflictException("Run output cannot be applied.");
			if (
				!input.suggestionIndexes.length ||
				input.suggestionIndexes.some(
					(i) => !Number.isInteger(i) || i < 0 || i >= parsed.data.tasks.length,
				)
			)
				throw new BadRequestException("Invalid suggestion indexes.");
			if (
				new Set(input.suggestionIndexes).size !== input.suggestionIndexes.length
			)
				throw new BadRequestException("Suggestion indexes must be unique.");
			const column = await tx.column.findFirst({
				where: { id: dto.columnId, boardId: context.boardId },
			});
			if (!column) throw new NotFoundException("Column not found.");
			const applied = await tx.aiAppliedSuggestion.count({
				where: { runId, suggestionIndex: { in: input.suggestionIndexes } },
			});
			if (applied)
				throw new ConflictException(
					"One or more suggestions have already been applied.",
				);
			const last = await tx.task.findFirst({
				where: { columnId: dto.columnId },
				orderBy: { sortKey: "desc" },
				select: { sortKey: true },
			});
			let sortKey = last?.sortKey ?? null;
			const taskIds: string[] = [];
			for (const index of input.suggestionIndexes) {
				const suggestion = parsed.data.tasks[index];
				if (!suggestion)
					throw new BadRequestException("Invalid suggestion index.");
				sortKey = generateKeyBetween(sortKey, null);
				const task = await tx.task.create({
					data: {
						...suggestion,
						boardId: context.boardId,
						columnId: dto.columnId,
						creatorId: context.userId,
						sortKey,
					},
				});
				taskIds.push(task.id);
				await tx.aiAppliedSuggestion.create({
					data: { runId, suggestionIndex: index, taskId: task.id },
				});
				await recordTaskEvent(tx, {
					actorId: context.userId,
					boardId: context.boardId,
					taskId: task.id,
					eventName: TaskEventName.CREATED,
					message: "AI suggestion added as task",
					payload: { taskId: task.id, columnId: dto.columnId, runId },
				});
			}
			const result = { taskIds };
			await tx.aiApplication.create({
				data: {
					runId,
					idempotencyKey: dto.idempotencyKey,
					actorId: context.userId,
					input: input as Prisma.InputJsonObject,
					result,
				},
			});
			return result;
		});
	}
}
