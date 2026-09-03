import {
	createParamDecorator,
	type ExecutionContext,
	InternalServerErrorException,
} from "@nestjs/common";
import type { Request } from "express";
import type { CurrentUser as CurrentUserModel } from "../../users/application/user-sync.service.js";

export type AuthenticatedRequest = Request & { user: CurrentUserModel };

export const CurrentUser = createParamDecorator(
	(_data: unknown, context: ExecutionContext): CurrentUserModel => {
		const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
		if (!user) {
			throw new InternalServerErrorException(
				"Authenticated user context is unavailable.",
			);
		}
		return user;
	},
);
