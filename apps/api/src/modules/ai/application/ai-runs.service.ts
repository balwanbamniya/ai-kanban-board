import { isDeepStrictEqual } from "node:util";
import {
	ConflictException,
	HttpException,
	HttpStatus,
	Inject,
	Injectable,
	NotFoundException,
	PayloadTooLargeException,
} from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import { Prisma } from "../../../generated/prisma/client.js";
import {
	type AiOperationKind,
	AiRunStatus,
} from "../../../generated/prisma/enums.js";
import { BoardAccessService } from "../../access-control/application/board-access.service.js";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import type { CreateAiRunDto } from "../presentation/dto/create-ai-run.dto.js";
import { AiEventName, recordAiEvent } from "./ai-events.js";

const MAX_BOARD_RUNS_PER_WINDOW = 100;
const MAX_USER_RUNS_PER_WINDOW = 25;
const MAX_INPUT_BYTES = 32 * 1_024;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type AiRunResponse = Prisma.AiRunGetPayload<Record<string, never>>;

@Injectable()
export class AiRunsService {
	constructor(
		@Inject(PrismaService) private readonly prisma: PrismaService,
		@Inject(BoardAccessService)
		private readonly boardAccess: BoardAccessService,
	) {}

	async create(
		context: BoardAccessContext,
		operationKind: AiOperationKind,
		dto: CreateAiRunDto,
	): Promise<AiRunResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.AI_RUN,
		]);
		this.assertInputSize(dto.input);

		return this.prisma.$transaction(async (transaction) => {
			await this.lockActiveBoard(transaction, context.boardId);
			await transaction.$executeRaw(
				Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${context.userId}, 0))`,
			);
			const existing = await transaction.aiRun.findUnique({
				where: {
					boardId_idempotencyKey: {
						boardId: context.boardId,
						idempotencyKey: dto.idempotencyKey,
					},
				},
			});
			if (existing) {
				if (
					existing.actorId !== context.userId ||
					existing.operationKind !== operationKind ||
					!isDeepStrictEqual(existing.input, dto.input)
				) {
					throw new ConflictException(
						"The idempotency key is already used for another AI request.",
					);
				}
				return existing;
			}

			const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS);
			const [boardRuns, userRuns] = await Promise.all([
				transaction.aiRun.count({
					where: { boardId: context.boardId, createdAt: { gte: windowStart } },
				}),
				transaction.aiRun.count({
					where: { actorId: context.userId, createdAt: { gte: windowStart } },
				}),
			]);
			if (boardRuns >= MAX_BOARD_RUNS_PER_WINDOW) {
				throw this.quotaExceeded("Board AI run quota exceeded.");
			}
			if (userRuns >= MAX_USER_RUNS_PER_WINDOW) {
				throw this.quotaExceeded("User AI run quota exceeded.");
			}

			const run = await transaction.aiRun.create({
				data: {
					actorId: context.userId,
					boardId: context.boardId,
					idempotencyKey: dto.idempotencyKey,
					input: dto.input as Prisma.InputJsonObject,
					model: null,
					operationKind,
					promptVersion: "v1",
					provider: null,
					status: AiRunStatus.QUEUED,
				},
			});
			await recordAiEvent(transaction, {
				actorId: context.userId,
				boardId: context.boardId,
				eventName: AiEventName.QUEUED,
				operationKind,
				runId: run.id,
			});
			return run;
		});
	}

	async get(
		context: BoardAccessContext,
		runId: string,
	): Promise<AiRunResponse> {
		this.boardAccess.assertContextPermissions(context, [
			BoardPermission.AI_RUN,
		]);
		const run = await this.prisma.aiRun.findFirst({
			where: { boardId: context.boardId, id: runId },
		});
		if (!run) throw new NotFoundException("AI run not found.");
		return run;
	}

	private assertInputSize(input: Record<string, unknown>): void {
		if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_INPUT_BYTES) {
			throw new PayloadTooLargeException(
				`AI run input must not exceed ${MAX_INPUT_BYTES} bytes.`,
			);
		}
	}

	private quotaExceeded(message: string): HttpException {
		return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
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
