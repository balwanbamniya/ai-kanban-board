import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnvironment({
	path: fileURLToPath(new URL("./.env", import.meta.url)),
	quiet: true,
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) {
	throw new Error(
		"Integration tests require an isolated DATABASE_URL whose database name ends in _test. Use pnpm --filter @repo/api test:integration:local.",
	);
}
process.env.WORKERS_ENABLED = "false";
export default defineConfig({
	test: {
		fileParallelism: false,
		include: ["src/**/*.integration.spec.ts"],
	},
});
