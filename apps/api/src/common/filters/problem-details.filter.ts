import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	HttpException,
	HttpStatus,
	Inject,
	Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RequestContextService } from "../request-context/request-context.service.js";

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
	private readonly logger = new Logger(ProblemDetailsFilter.name);
	constructor(
		@Inject(RequestContextService)
		private readonly context: RequestContextService,
	) {}
	catch(error: unknown, host: ArgumentsHost): void {
		if (host.getType() !== "http") throw error;
		const http = host.switchToHttp();
		const res = http.getResponse<Response>();
		const req = http.getRequest<Request & { id?: string }>();
		if (res.headersSent) return;
		const bodyError =
			error instanceof Error &&
			"type" in error &&
			error.type === "entity.too.large";
		const status =
			error instanceof HttpException
				? error.getStatus()
				: bodyError
					? 413
					: 500;
		const raw =
			error instanceof HttpException ? error.getResponse() : undefined;
		const message =
			typeof raw === "string"
				? raw
				: raw && "message" in raw
					? raw.message
					: undefined;
		const errors =
			status < 500 && Array.isArray(message) ? message.map(String) : undefined;
		const detail =
			status >= 500
				? "An unexpected error occurred."
				: (errors?.join("; ") ??
					(typeof message === "string"
						? message
						: bodyError
							? "Request body exceeds the 1 MB limit."
							: "Request failed."));
		const requestId = this.context.requestId ?? req.id;
		if (status >= 500)
			this.logger.error({ message: "HTTP request failed", status, requestId });
		res
			.status(status)
			.type("application/problem+json")
			.json({
				type: "about:blank",
				title: HttpStatus[status]?.replaceAll("_", " ") ?? "Error",
				status,
				detail,
				instance: req.path,
				requestId,
				...(errors ? { errors } : {}),
			});
	}
}
