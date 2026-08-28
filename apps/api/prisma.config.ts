import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnvironment({
	path: fileURLToPath(new URL("./.env", import.meta.url)),
	quiet: true,
});

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
		seed: "tsx prisma/seed.ts",
	},
	datasource: process.env.DATABASE_URL
		? { url: process.env.DATABASE_URL }
		: undefined,
});
