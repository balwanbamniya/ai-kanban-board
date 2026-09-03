import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AppConfigService } from "../../../config/app-config.service.js";
import { InvalidIdentityWebhookError } from "../domain/identity-provider.errors.js";
import { ClerkIdentityProvider } from "./clerk-identity.provider.js";

describe("Clerk webhook signature verification", () => {
	const secret = Buffer.from("test-webhook-secret");
	const signingSecret = `whsec_${secret.toString("base64")}`;
	const config = {
		clerkAudience: [],
		clerkAuthorizedParties: ["http://localhost:3000"],
		clerkJwtKey: "unused-public-key",
		clerkSecretKey: "sk_test_example",
		clerkWebhookSigningSecret: signingSecret,
	} as unknown as AppConfigService;

	it("accepts a correctly signed event and rejects a changed payload", async () => {
		const provider = new ClerkIdentityProvider(config);
		const eventId = "event_signed";
		const timestamp = Math.floor(Date.now() / 1000).toString();
		const payload = JSON.stringify({ data: {}, type: "session.created" });
		const signature = createHmac("sha256", secret)
			.update(`${eventId}.${timestamp}.${payload}`)
			.digest("base64");
		const headers = {
			"svix-id": eventId,
			"svix-signature": `v1,${signature}`,
			"svix-timestamp": timestamp,
		};

		await expect(
			provider.verifyWebhook(
				new Request("http://localhost/webhooks/clerk", {
					body: payload,
					headers,
					method: "POST",
				}),
			),
		).resolves.toEqual({ eventId, kind: "ignored" });

		await expect(
			provider.verifyWebhook(
				new Request("http://localhost/webhooks/clerk", {
					body: `${payload} `,
					headers,
					method: "POST",
				}),
			),
		).rejects.toBeInstanceOf(InvalidIdentityWebhookError);
	});
});
