import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnvironment({
	path: fileURLToPath(new URL("./.env", import.meta.url)),
	quiet: true,
});

export default defineConfig({
	test: {
		fileParallelism: false,
		include: ["src/**/*.integration.spec.ts"],
	},
});
