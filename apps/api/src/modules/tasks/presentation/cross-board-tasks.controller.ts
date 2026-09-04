import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiExtraModels,
	ApiOkResponse,
	ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../../identity/presentation/current-user.decorator.js";
import type { CurrentUser as User } from "../../users/application/user-sync.service.js";
import { TasksService } from "../application/tasks.service.js";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto.js";
import { ListTasksResponseDto } from "./dto/task-response.dto.js";
@ApiTags("tasks")
@ApiBearerAuth()
@ApiExtraModels(ListTasksQueryDto)
@Controller("tasks")
export class CrossBoardTasksController {
	constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
	@Get()
	@ApiOkResponse({ type: ListTasksResponseDto })
	list(@CurrentUser() user: User, @Query() query: ListTasksQueryDto) {
		return this.tasks.acrossBoards(user.id, query);
	}
}
