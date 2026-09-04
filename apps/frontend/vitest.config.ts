import { defineConfig } from "vitest/config";

// Exercise local calendar calculations across daylight-saving transitions.
process.env.TZ = "America/New_York";

export default defineConfig({
	test: {
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
	},
});
