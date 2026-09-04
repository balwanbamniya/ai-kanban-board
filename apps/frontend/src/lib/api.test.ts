import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, validateBoard } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("authenticated API client", () => {
	it("obtains a token for each request, sends JSON and cancellation, and handles 204", async () => {
		const getToken = vi
			.fn()
			.mockResolvedValueOnce("first")
			.mockResolvedValueOnce("second");
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "board" }), { status: 201 }),
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetcher);
		const request = createApiClient(getToken, "http://localhost:3001/api/v1/");
		const signal = new AbortController().signal;
		expect(
			await request("/boards", {
				body: { title: "Plan", color: "#bf4f2b" },
				signal,
			}),
		).toEqual({ id: "board" });
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			"http://localhost:3001/api/v1/boards",
			expect.objectContaining({
				method: "POST",
				signal,
				headers: expect.objectContaining({
					Authorization: "Bearer first",
					"Content-Type": "application/json",
				}),
			}),
		);
		expect(await request("/users/me")).toBeUndefined();
		expect(getToken).toHaveBeenCalledTimes(2);
		expect(fetcher.mock.calls[1]?.[1].headers.Authorization).toBe(
			"Bearer second",
		);
	});
	it("never sends an unauthenticated request", async () => {
		const fetcher = vi.fn();
		vi.stubGlobal("fetch", fetcher);
		await expect(
			createApiClient(async () => null)("/boards"),
		).rejects.toMatchObject({ status: 401 });
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("preserves safe problem details and request IDs", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						detail: "Invalid board name",
						requestId: "request-7",
						errors: ["Name is required", 42],
					}),
					{
						status: 400,
						headers: { "content-type": "application/problem+json" },
					},
				),
			),
		);
		await expect(
			createApiClient(async () => "token")("/boards"),
		).rejects.toMatchObject({
			message: "Invalid board name",
			requestId: "request-7",
			details: ["Name is required"],
		});
	});
	it("does not expose unexpected server errors", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({ detail: "private database credentials" }),
					{
						status: 500,
						headers: {
							"content-type": "application/problem+json",
							"x-request-id": "r8",
						},
					},
				),
			),
		);
		await expect(
			createApiClient(async () => "token")("/boards"),
		).rejects.toMatchObject({
			message: "Something went wrong. Please try again.",
			requestId: "r8",
		});
	});
	it("provides a recoverable network error without automatically replaying writes", async () => {
		const fetcher = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		vi.stubGlobal("fetch", fetcher);
		await expect(
			createApiClient(async () => "token")("/boards", {
				body: { title: "Plan", color: "#bf4f2b" },
			}),
		).rejects.toBeInstanceOf(ApiError);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it("preserves cancellation", async () => {
		const controller = new AbortController();
		controller.abort();
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(controller.signal.reason));
		await expect(
			createApiClient(async () => "token")("/boards", {
				signal: controller.signal,
			}),
		).rejects.toBe(controller.signal.reason);
	});
});
describe("board validation", () => {
	it.each(["", "   ", "a".repeat(121)])("rejects invalid names", (title) => {
		expect(validateBoard({ title, color: "#bf4f2b" })).not.toBeNull();
	});
	it("enforces description and color limits", () => {
		expect(
			validateBoard({
				title: "Board",
				description: "x".repeat(2001),
				color: "#bf4f2b",
			}),
		).not.toBeNull();
		expect(validateBoard({ title: "Board", color: "red" })).not.toBeNull();
		expect(
			validateBoard({
				title: " Board ",
				description: "x".repeat(2000),
				color: "#BF4F2B",
			}),
		).toBeNull();
	});
});
