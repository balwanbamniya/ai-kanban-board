import "reflect-metadata";
import { fileURLToPath } from "node:url";
import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import { AppConfigService } from "../src/config/app-config.service.js";
import {
	type Environment,
	validateEnvironment,
} from "../src/config/env.validation.js";
import {
	AiProviderError,
	OpenAiProvider,
} from "../src/modules/ai/application/openai-provider.js";

config({
	path: fileURLToPath(new URL("../.env", import.meta.url)),
	quiet: true,
});
const configuration = new AppConfigService(
	new ConfigService<Environment, true>(validateEnvironment(process.env)),
);
try {
	const provider = new OpenAiProvider(configuration);
	const result = await provider.execute(
		"TASK_GENERATION",
		{
			instructions: "Suggest one task for reviewing a release checklist.",
			count: 1,
		},
		{ board: { title: "Smoke test" }, tasks: [], truncated: false },
	);
	console.log(
		JSON.stringify({
			status: "ok",
			model: result.model,
			operation: "TASK_GENERATION",
			validated: true,
		}),
	);
} catch (error) {
	console.error(
		JSON.stringify({
			status: "failed",
			code: error instanceof AiProviderError ? error.code : "SMOKE_TEST_FAILED",
		}),
	);
	process.exitCode = 1;
}
