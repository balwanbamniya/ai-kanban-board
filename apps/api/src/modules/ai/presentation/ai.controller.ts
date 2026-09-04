import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	ParseUUIDPipe,
	Post,
} from "@nestjs/common";
import {
	ApiAcceptedResponse,
	ApiBearerAuth,
	ApiBody,
	ApiConflictResponse,
	ApiExtraModels,
	ApiOkResponse,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AiOperationKind } from "../../../generated/prisma/enums.js";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import { CheckBoardPermissions } from "../../access-control/presentation/check-board-permissions.decorator.js";
import { CurrentBoardAccess } from "../../access-control/presentation/current-board-access.decorator.js";
import { AiApplicationService } from "../application/ai-application.service.js";
import {
	type AiRunResponse,
	AiRunsService,
} from "../application/ai-runs.service.js";
import { AiRunResponseDto } from "./dto/ai-run-response.dto.js";
import {
	ApplyAiRunDto,
	ApplyAiRunResponseDto,
} from "./dto/apply-ai-run.dto.js";
import {
	BoardSummaryRunDto,
	CreateAiRunDto,
	TaskGenerationRunDto,
} from "./dto/create-ai-run.dto.js";

@ApiTags("ai")
@ApiBearerAuth()
@ApiExtraModels(
	CreateAiRunDto,
	TaskGenerationRunDto,
	BoardSummaryRunDto,
	ApplyAiRunDto,
)
@Controller("boards/:boardId/ai")
export class AiController {
	constructor(
		@Inject(AiRunsService) private readonly runs: AiRunsService,
		@Inject(AiApplicationService)
		private readonly applications: AiApplicationService,
	) {}

	@Post("task-generation-runs")
	@ApiBody({ type: TaskGenerationRunDto })
	@HttpCode(HttpStatus.ACCEPTED)
	@ApiAcceptedResponse({ type: AiRunResponseDto })
	@ApiConflictResponse({
		description: "The idempotency key is already in use.",
	})
	@ApiResponse({
		status: 429,
		description: "The rolling AI run quota is exhausted.",
	})
	@CheckBoardPermissions(BoardPermission.AI_RUN)
	createTaskGenerationRun(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: TaskGenerationRunDto,
	): Promise<AiRunResponse> {
		return this.runs.create(context, AiOperationKind.TASK_GENERATION, dto);
	}

	@Post("summary-runs")
	@ApiBody({ type: BoardSummaryRunDto })
	@HttpCode(HttpStatus.ACCEPTED)
	@ApiAcceptedResponse({ type: AiRunResponseDto })
	@ApiConflictResponse({
		description: "The idempotency key is already in use.",
	})
	@ApiResponse({
		status: 429,
		description: "The rolling AI run quota is exhausted.",
	})
	@CheckBoardPermissions(BoardPermission.AI_RUN)
	createSummaryRun(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: BoardSummaryRunDto,
	): Promise<AiRunResponse> {
		return this.runs.create(context, AiOperationKind.BOARD_SUMMARY, dto);
	}

	@Post("runs/:runId/apply")
	@ApiBody({ type: ApplyAiRunDto })
	@HttpCode(HttpStatus.OK)
	@ApiOkResponse({ type: ApplyAiRunResponseDto })
	@CheckBoardPermissions(BoardPermission.AI_RUN, BoardPermission.TASK_CREATE)
	applyRun(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("runId", new ParseUUIDPipe({ version: "4" })) runId: string,
		@Body() dto: ApplyAiRunDto,
	): Promise<ApplyAiRunResponseDto> {
		return this.applications.apply(context, runId, dto);
	}

	@Get("runs/:runId")
	@ApiOkResponse({ type: AiRunResponseDto })
	@CheckBoardPermissions(BoardPermission.AI_RUN)
	getRun(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("runId", new ParseUUIDPipe({ version: "4" })) runId: string,
	): Promise<AiRunResponse> {
		return this.runs.get(context, runId);
	}
}
