import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticationService } from "../application/authentication.service.js";
import { InvalidIdentityWebhookError } from "../domain/identity-provider.errors.js";
import { ClerkWebhookController } from "./clerk-webhook.controller.js";

describe("ClerkWebhookController", () => {
	it("passes the untouched raw payload and signature headers for verification", async () => {
		const processWebhook = vi.fn().mockResolvedValue(undefined);
		const controller = new ClerkWebhookController({
			processWebhook,
		} as unknown as AuthenticationService);
		const rawBody = Buffer.from('{"type":"user.created"}');

		await controller.handle({
			headers: {
				"content-type": "application/json",
				"svix-id": "event_1",
				"svix-signature": "signature",
				"svix-timestamp": "1788393600",
			},
			rawBody,
		} as never);

		const request = processWebhook.mock.calls[0]?.[0] as Request;
		expect(await request.text()).toBe(rawBody.toString("utf8"));
		expect(request.headers.get("svix-id")).toBe("event_1");
	});

	it("rejects missing raw bodies and invalid signatures", async () => {
		const processWebhook = vi.fn();
		const controller = new ClerkWebhookController({
			processWebhook,
		} as unknown as AuthenticationService);

		await expect(
			controller.handle({ headers: {} } as never),
		).rejects.toBeInstanceOf(BadRequestException);

		processWebhook.mockRejectedValueOnce(new InvalidIdentityWebhookError());
		await expect(
			controller.handle({ headers: {}, rawBody: Buffer.from("{}") } as never),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
