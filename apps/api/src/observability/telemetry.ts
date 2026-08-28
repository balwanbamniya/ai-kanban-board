import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export interface TelemetryOptions {
	enabled: boolean;
	serviceName: string;
}

let telemetry: NodeSDK | undefined;

export function startTelemetry(options: TelemetryOptions): void {
	if (!options.enabled || telemetry) {
		return;
	}

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
