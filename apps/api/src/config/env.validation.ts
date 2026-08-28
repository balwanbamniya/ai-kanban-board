import { z } from "zod";

const telemetryEnvironmentSchema = z.object({
	OTEL_ENABLED: z
		.enum(["true", "false"])
		.default("false")
		.transform((value) => value === "true"),
	OTEL_SERVICE_NAME: z.string().trim().min(1).default("ai-kanban-api"),
});

const httpOriginSchema = z.url().refine(
	(value) => {
		const protocol = new URL(value).protocol;
		return protocol === "http:" || protocol === "https:";
	},
	{ message: "must use the http or https protocol" },
);

const environmentSchema = telemetryEnvironmentSchema.extend({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: z.coerce.number().int().min(1).max(65535).default(3001),
	API_PREFIX: z
		.string()
		.trim()
		.default("api/v1")
		.transform((value) => value.replace(/^\/+|\/+$/g, ""))
		.pipe(
			z
				.string()
				.min(1)
				.regex(/^[A-Za-z0-9]+(?:[/-][A-Za-z0-9]+)*$/),
		),
	CORS_ORIGINS: z
		.string()
		.default("http://localhost:3000")
		.transform((value) =>
			value
				.split(",")
				.map((origin) => origin.trim())
				.filter(Boolean),
		)
		.pipe(z.array(httpOriginSchema).min(1)),
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
		.default("info"),
});

export type Environment = z.output<typeof environmentSchema>;
export type TelemetryEnvironment = z.output<typeof telemetryEnvironmentSchema>;

function formatEnvironmentError(error: z.ZodError): Error {
	const details = error.issues
		.map(
			(issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
		)
		.join("; ");

	return new Error(`Invalid environment configuration: ${details}`);
}

export function validateEnvironment(
	config: Record<string, unknown>,
): Environment {
	const result = environmentSchema.safeParse(config);

	if (!result.success) {
		throw formatEnvironmentError(result.error);
	}

	return result.data;
}

export function readTelemetryEnvironment(
	config: Record<string, unknown>,
): TelemetryEnvironment {
	const result = telemetryEnvironmentSchema.safeParse(config);

	if (!result.success) {
		throw formatEnvironmentError(result.error);
	}

	return result.data;
}
