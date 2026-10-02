import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import { readTelemetryEnvironment } from "./config/env.validation.js";
import {
	shutdownTelemetry,
	startTelemetry,
} from "./observability/telemetry.js";

loadEnvironment({
	path: fileURLToPath(new URL("../.env", import.meta.url)),
	quiet: true,
});

try {
	const telemetryConfig = readTelemetryEnvironment(process.env);
	await startTelemetry({
		enabled: telemetryConfig.OTEL_ENABLED,
		serviceName: telemetryConfig.OTEL_SERVICE_NAME,
	});

	const { bootstrap } = await import("./server.js");
	await bootstrap();
} catch (error) {
	await shutdownTelemetry();
	throw error;
}
