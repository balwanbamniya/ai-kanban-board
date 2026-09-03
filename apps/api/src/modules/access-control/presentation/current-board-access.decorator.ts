import {
	createParamDecorator,
	type ExecutionContext,
	InternalServerErrorException,
} from "@nestjs/common";
import type { BoardAccessContext } from "../domain/board-access-context.js";
import type { BoardAuthorizedRequest } from "./board-policies.guard.js";

export const CurrentBoardAccess = createParamDecorator(
	(_data: unknown, context: ExecutionContext): BoardAccessContext => {
		const boardAccess = context
			.switchToHttp()
			.getRequest<BoardAuthorizedRequest>().boardAccess;
		if (!boardAccess) {
			throw new InternalServerErrorException(
				"Board access context is unavailable.",
			);
		}
		return boardAccess;
	},
);
