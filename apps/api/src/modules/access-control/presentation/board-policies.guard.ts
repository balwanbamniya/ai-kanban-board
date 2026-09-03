import {
	type CanActivate,
	type ExecutionContext,
	Inject,
	Injectable,
	InternalServerErrorException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "../../identity/presentation/current-user.decorator.js";
import { BoardAccessService } from "../application/board-access.service.js";
import type { BoardAccessContext } from "../domain/board-access-context.js";
import { BoardPolicy } from "./board-policy.metadata.js";

export type BoardAuthorizedRequest = AuthenticatedRequest & {
	boardAccess?: BoardAccessContext;
};

@Injectable()
export class BoardPoliciesGuard implements CanActivate {
	constructor(
		@Inject(Reflector) private readonly reflector: Reflector,
		@Inject(BoardAccessService)
		private readonly boardAccess: BoardAccessService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const policy = this.reflector.getAllAndOverride(BoardPolicy, [
			context.getHandler(),
			context.getClass(),
		]);
		if (!policy) {
			return true;
		}

		const request = context.switchToHttp().getRequest<BoardAuthorizedRequest>();
		if (!request.user) {
			throw new InternalServerErrorException(
				"Authenticated user context is unavailable.",
			);
		}

		const boardId = request.params[policy.boardIdParam];
		if (typeof boardId !== "string" || boardId.length === 0) {
			throw new InternalServerErrorException(
				"Board authorization route is misconfigured.",
			);
		}

		request.boardAccess = await this.boardAccess.assertPermissions(
			request.user.id,
			boardId,
			policy.permissions,
		);
		return true;
	}
}
