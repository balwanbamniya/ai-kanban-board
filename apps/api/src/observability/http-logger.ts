import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ConsoleLogger, type LogLevel } from "@nestjs/common";
import { type HttpLogger, pinoHttp } from "pino-http";
import type { Environment } from "../config/env.validation.js";

const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const NEST_LOG_LEVELS: Record<Environment["LOG_LEVEL"], LogLevel[]> = {
	fatal: ["fatal"],
	error: ["fatal", "error"],
	warn: ["fatal", "error", "warn"],
	info: ["fatal", "error", "warn", "log"],
	debug: ["fatal", "error", "warn", "log", "debug"],
	trace: ["fatal", "error", "warn", "log", "debug", "verbose"],
	silent: [],
};

function getRequestId(req: IncomingMessage, res: ServerResponse): string {
	const header = req.headers[REQUEST_ID_HEADER];
	const suppliedId = Array.isArray(header) ? header[0] : header;
	const requestId =
		suppliedId && REQUEST_ID_PATTERN.test(suppliedId)
			? suppliedId
			: randomUUID();

	res.setHeader(REQUEST_ID_HEADER, requestId);

	return requestId;
}

export function createApplicationLogger({
	level,
	serviceName,
}: {
	level: Environment["LOG_LEVEL"];
	serviceName: string;
}): ConsoleLogger {
	return new ConsoleLogger(serviceName, {
		json: true,
		logLevels: NEST_LOG_LEVELS[level],
	});
}

export function createHttpLogger({
	environment,
	level,
	serviceName,
}: {
	environment: Environment["NODE_ENV"];
	level: Environment["LOG_LEVEL"];
	serviceName: string;
}): HttpLogger {
	return pinoHttp({
		level,
		base: {
			environment,
			service: serviceName,
		},
		genReqId: getRequestId,
		redact: {
			paths: [
				"req.headers.authorization",
				"req.headers.cookie",
				"req.headers.x-api-key",
				"res.headers.set-cookie",
			],
			censor: "[REDACTED]",
		},
	});
}
