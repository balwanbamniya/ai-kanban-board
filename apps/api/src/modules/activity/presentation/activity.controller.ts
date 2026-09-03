import {
	Controller,
	Get,
	Inject,
	Param,
	ParseUUIDPipe,
	Query,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiExtraModels,
	ApiOkResponse,
	ApiTags,
} from "@nestjs/swagger";
import type { BoardAccessContext } from "../../access-control/domain/board-access-context.js";
import { BoardPermission } from "../../access-control/domain/board-permission.enum.js";
import { CheckBoardPermissions } from "../../access-control/presentation/check-board-permissions.decorator.js";
import { CurrentBoardAccess } from "../../access-control/presentation/current-board-access.decorator.js";
import { ActivityService } from "../application/activity.service.js";
import { ListActivityResponseDto } from "./dto/activity-response.dto.js";
import { ListActivityQueryDto } from "./dto/list-activity-query.dto.js";

@ApiTags("activity")
@ApiBearerAuth()
@ApiExtraModels(ListActivityQueryDto)
@Controller("boards/:boardId/activity")
export class ActivityController {
	constructor(
		@Inject(ActivityService) private readonly activity: ActivityService,
	) {}

	@Get()
	@ApiOkResponse({ type: ListActivityResponseDto })
	@CheckBoardPermissions(BoardPermission.ACTIVITY_READ)
	list(
		@CurrentBoardAccess() context: BoardAccessContext,
		@Param("boardId", new ParseUUIDPipe({ version: "4" })) _boardId: string,
		@Query() query: ListActivityQueryDto,
	): Promise<ListActivityResponseDto> {
		return this.activity.list(context, query);
	}
}
