import {
	type CanActivate,
	type ExecutionContext,
	Inject,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthenticationService } from "../application/authentication.service.js";
import type { AuthenticatedRequest } from "./current-user.decorator.js";
import { Public } from "./public.decorator.js";

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		@Inject(AuthenticationService)
		private readonly authentication: AuthenticationService,
		@Inject(Reflector) private readonly reflector: Reflector,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride(Public, [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) {
			return true;
		}

		const request = context.switchToHttp().getRequest<Request>();
		const token = this.extractBearerToken(request);
		const user = await this.authentication.authenticate(token);
		(request as AuthenticatedRequest).user = user;
		return true;
	}

	private extractBearerToken(request: Request): string {
		const header = request.header("authorization");
		if (!header) {
			throw new UnauthorizedException("Authentication is required.");
		}

		const match = /^Bearer ([^\s]+)$/.exec(header);
		if (!match?.[1]) {
			throw new UnauthorizedException("Authorization must use a Bearer token.");
		}
		return match[1];
	}
}
