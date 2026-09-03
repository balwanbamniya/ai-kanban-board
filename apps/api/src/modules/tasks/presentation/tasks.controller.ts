import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiExtraModels,
	ApiNoContentResponse,
	ApiOkResponse,
	ApiTags,
} from "@nestjs/swagger";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import { CheckBoardPermissions } from "../../access-control/presentation/check-board-permissions.decorator.js";
import { CurrentBoardAccess } from "../../access-control/presentation/current-board-access.decorator.js";
import {
	type TaskResponse,
	TasksService,
} from "../application/tasks.service.js";
import { CreateTaskDto } from "./dto/create-task.dto.js";
import { DeleteTaskDto } from "./dto/delete-task.dto.js";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto.js";
import { MoveTaskDto } from "./dto/move-task.dto.js";
import {
	ListTasksResponseDto,
	TaskResponseDto,
} from "./dto/task-response.dto.js";
import { UpdateTaskDto } from "./dto/update-task.dto.js";

@ApiTags("tasks")
@ApiBearerAuth()
@ApiExtraModels(
	CreateTaskDto,
	DeleteTaskDto,
	ListTasksQueryDto,
	MoveTaskDto,
	UpdateTaskDto,
)
@Controller("boards/:boardId/tasks")
export class TasksController {
	constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

	@Get()
	@ApiOkResponse({ type: ListTasksResponseDto })
	@CheckBoardPermissions(BoardPermission.BOARD_READ)
	list(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Query() query: ListTasksQueryDto,
	): Promise<ListTasksResponseDto> {
		return this.tasks.list(context, query);
	}

	@Post()
	@ApiCreatedResponse({ type: TaskResponseDto })
	@CheckBoardPermissions(BoardPermission.TASK_CREATE)
	create(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Body() dto: CreateTaskDto,
	): Promise<TaskResponse> {
		return this.tasks.create(context, dto);
	}

	@Patch(":taskId")
	@ApiConflictResponse({ description: "The task version is stale." })
	@ApiOkResponse({ type: TaskResponseDto })
	@CheckBoardPermissions(BoardPermission.TASK_UPDATE)
	update(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("taskId", new ParseUUIDPipe({ version: "4" })) taskId: string,
		@Body() dto: UpdateTaskDto,
	): Promise<TaskResponse> {
		return this.tasks.update(context, taskId, dto);
	}

	@Patch(":taskId/move")
	@ApiConflictResponse({ description: "The task version is stale." })
	@ApiOkResponse({ type: TaskResponseDto })
	@CheckBoardPermissions(BoardPermission.TASK_MOVE)
	move(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("taskId", new ParseUUIDPipe({ version: "4" })) taskId: string,
		@Body() dto: MoveTaskDto,
	): Promise<TaskResponse> {
		return this.tasks.move(context, taskId, dto);
	}

	@Delete(":taskId")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiNoContentResponse()
	@ApiConflictResponse({ description: "The task version is stale." })
	@CheckBoardPermissions(BoardPermission.TASK_DELETE)
	async delete(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Param("taskId", new ParseUUIDPipe({ version: "4" })) taskId: string,
		@Body() dto: DeleteTaskDto,
	): Promise<void> {
		await this.tasks.delete(context, taskId, dto.version);
	}
}
