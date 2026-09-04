import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../../../config/app-config.service.js";
import { OpenAiProvider } from "./openai-provider.js";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("openai")>();
	class Client {
		static APIError = actual.APIError;
		static APIConnectionTimeoutError = actual.APIConnectionTimeoutError;
		responses = { parse };
	}

	return { ...actual, default: Client };
});
const config = {
	openaiApiKey: "fixture",
	openaiModel: "gpt-5.4-mini",
} as AppConfigService;
const provider = new OpenAiProvider(config);
const input = { instructions: "Plan release", count: 1 };
const tasks = {
	tasks: [{ title: "Review", description: null, priority: "HIGH" }],
};
describe("OpenAI provider", () => {
	beforeEach(() => {
		parse.mockReset();
	});
	it("returns validated suggestions and usage with storage disabled", async () => {
		parse.mockResolvedValue({
			status: "completed",
			output: [],
			output_parsed: tasks,
			usage: { input_tokens: 10 },
		});
		expect(await provider.execute("TASK_GENERATION", input, {})).toMatchObject({
			output: tasks,
			usage: { input_tokens: 10 },
		});
		expect(parse).toHaveBeenCalledWith(
			expect.objectContaining({ store: false, model: "gpt-5.4-mini" }),
		);
	});
	it("validates summary output separately", async () => {
		const output = { overview: "Ready", blockers: [], nextActions: ["Review"] };
		parse.mockResolvedValue({
			status: "completed",
			output: [],
			output_parsed: output,
		});
		expect(await provider.execute("BOARD_SUMMARY", {}, {})).toMatchObject({
			output,
		});
	});
	it.each([
		[
			{
				status: "completed",
				output: [
					{ type: "message", content: [{ type: "refusal", refusal: "no" }] },
				],
			},
			"PROVIDER_REFUSAL",
		],
		[
			{ status: "incomplete", output: [], output_parsed: null },
			"INCOMPLETE_OUTPUT",
		],
		[
			{
				status: "completed",
				output: [],
				output_parsed: {
					tasks: [{ title: "", description: null, priority: "HIGH" }],
				},
			},
			"INVALID_OUTPUT",
		],
	])("rejects unusable results without retries", async (response, code) => {
		parse.mockResolvedValue(response);
		await expect(
			provider.execute("TASK_GENERATION", input, {}),
		).rejects.toMatchObject({ code, retryable: false });
	});
	it("classifies rate limits and timeouts as retryable without leaking messages", async () => {
		for (const error of [
			new OpenAI.APIError(
				429,
				{ message: "secret provider detail" },
				"secret provider detail",
				new Headers(),
			),
			new OpenAI.APIConnectionTimeoutError(),
		]) {
			parse.mockRejectedValue(error);
			const outcome = await provider.execute("TASK_GENERATION", input, {}).then(
				() => null,
				(failure: unknown) => failure,
			);
			expect(outcome).toMatchObject({
				code: "PROVIDER_REQUEST_FAILED",
				retryable: true,
			});
		}
	});
	it("rejects unbounded and unexpected request fields", async () => {
		await expect(
			provider.execute("TASK_GENERATION", { ...input, count: 21 }, {}),
		).rejects.toMatchObject({ code: "INVALID_INPUT" });
		expect(parse).not.toHaveBeenCalled();
	});
});
