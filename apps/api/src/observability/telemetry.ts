import type { NodeSDK } from "@opentelemetry/sdk-node";

export interface TelemetryOptions {
	enabled: boolean;
	serviceName: string;
}

let telemetry: NodeSDK | undefined;

// OpenTelemetry packages are heavy; load them only when telemetry is enabled.
export async function startTelemetry(options: TelemetryOptions): Promise<void> {
	if (!options.enabled || telemetry) {
		return;
	}

	const [
		{ getNodeAutoInstrumentations },
		{ resourceFromAttributes },
		{ NodeSDK },
		{ ATTR_SERVICE_NAME },
	] = await Promise.all([
		import("@opentelemetry/auto-instrumentations-node"),
		import("@opentelemetry/resources"),
		import("@opentelemetry/sdk-node"),
		import("@opentelemetry/semantic-conventions"),
	]);

	telemetry = new NodeSDK({
		instrumentations: [getNodeAutoInstrumentations()],
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: options.serviceName,
		}),
	});
	telemetry.start();
}

export async function shutdownTelemetry(): Promise<void> {
	const sdk = telemetry;
	telemetry = undefined;
	await sdk?.shutdown();
}
