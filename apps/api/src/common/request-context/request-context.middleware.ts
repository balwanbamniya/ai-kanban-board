import { randomUUID } from "node:crypto";
import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { RequestContextService } from "./request-context.service.js";

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
type RequestWithId = Request & { id?: string | number };

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
	constructor(
		@Inject(RequestContextService)
		private readonly requestContext: RequestContextService,
	) {}

	use(request: Request, response: Response, next: NextFunction): void {
		const suppliedRequestId = request.header("x-request-id");
		const loggerRequestId = String((request as RequestWithId).id ?? "");
		const requestId =
			(suppliedRequestId && requestIdPattern.test(suppliedRequestId)
				? suppliedRequestId
				: undefined) ??
			(requestIdPattern.test(loggerRequestId) ? loggerRequestId : undefined) ??
			randomUUID();

		response.setHeader("x-request-id", requestId);
		this.requestContext.run({ requestId }, next);
	}
}
