import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../../../config/app-config.service.js";
import {
	IdentityProviderUnavailableError,
	InvalidIdentityProfileError,
	InvalidIdentityTokenError,
	InvalidIdentityWebhookError,
} from "../domain/identity-provider.errors.js";

const clerk = vi.hoisted(() => ({
	getUser: vi.fn(),
	verifyToken: vi.fn(),
	verifyWebhook: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
	createClerkClient: vi.fn(() => ({ users: { getUser: clerk.getUser } })),
	verifyToken: clerk.verifyToken,
}));

vi.mock("@clerk/backend/webhooks", () => ({
	verifyWebhook: clerk.verifyWebhook,
}));

import { ClerkIdentityProvider } from "./clerk-identity.provider.js";

describe("ClerkIdentityProvider", () => {
	const config = {
		clerkAudience: ["api://kanban"],
		clerkAuthorizedParties: ["https://app.example.com"],
		clerkJwtKey: "public-key",
		clerkSecretKey: "sk_test_example",
		clerkWebhookSigningSecret: "whsec_example",
	} as AppConfigService;
	const clerkUser = {
		emailAddresses: [{ emailAddress: "USER@Example.com", id: "email_1" }],
		firstName: "Example",
		id: "user_clerk",
		imageUrl: "https://images.example.com/user.png",
		lastName: "User",
		primaryEmailAddressId: "email_1",
		updatedAt: Date.parse("2026-09-03T00:00:00.000Z"),
		username: null,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		clerk.verifyToken.mockResolvedValue({
			sid: "session_1",
			sub: "user_clerk",
		});
		clerk.getUser.mockResolvedValue(clerkUser);
	});

	it("verifies bearer session tokens with audience and authorized parties", async () => {
		const provider = new ClerkIdentityProvider(config);

		await expect(provider.verifySessionToken("token")).resolves.toEqual({
			externalAuthId: "user_clerk",
			sessionId: "session_1",
		});
		expect(clerk.verifyToken).toHaveBeenCalledWith("token", {
			audience: config.clerkAudience,
			authorizedParties: config.clerkAuthorizedParties,
			jwtKey: config.clerkJwtKey,
		});
	});

	it("maps failed verification to an invalid token without leaking details", async () => {
		clerk.verifyToken.mockRejectedValue(
			new Error("sensitive verification error"),
		);
		const provider = new ClerkIdentityProvider(config);

		await expect(provider.verifySessionToken("invalid")).rejects.toEqual(
			expect.any(InvalidIdentityTokenError),
		);

		clerk.verifyToken.mockResolvedValueOnce({ sub: "machine_subject" });
		await expect(provider.verifySessionToken("machine-token")).rejects.toEqual(
			expect.any(InvalidIdentityTokenError),
		);
	});

	it("normalizes a Clerk profile and requires its primary email", async () => {
		const provider = new ClerkIdentityProvider(config);

		await expect(provider.getProfile("user_clerk")).resolves.toEqual({
			avatarUrl: clerkUser.imageUrl,
			email: "user@example.com",
			externalAuthId: clerkUser.id,
			name: "Example User",
			providerUpdatedAt: new Date(clerkUser.updatedAt),
		});

		clerk.getUser.mockResolvedValueOnce({
			...clerkUser,
			primaryEmailAddressId: null,
		});
		await expect(provider.getProfile("user_clerk")).rejects.toBeInstanceOf(
			InvalidIdentityProfileError,
		);
	});

	it("distinguishes deleted identities from transient Clerk failures", async () => {
		const provider = new ClerkIdentityProvider(config);
		clerk.getUser.mockRejectedValueOnce({ status: 404 });
		await expect(provider.getProfile("deleted")).rejects.toBeInstanceOf(
			InvalidIdentityTokenError,
		);

		clerk.getUser.mockRejectedValueOnce({ status: 503 });
		await expect(provider.getProfile("unavailable")).rejects.toBeInstanceOf(
			IdentityProviderUnavailableError,
		);
	});

	it("maps signed user events and acknowledges unrelated events", async () => {
		const provider = new ClerkIdentityProvider(config);
		const request = new Request("http://localhost/webhooks/clerk", {
			headers: { "svix-id": "event_1", "svix-timestamp": "1788393600" },
		});
		clerk.verifyWebhook.mockResolvedValueOnce({
			data: {
				email_addresses: [{ email_address: "USER@example.com", id: "email_1" }],
				first_name: "Example",
				id: "user_clerk",
				image_url: "",
				last_name: "User",
				primary_email_address_id: "email_1",
				updated_at: clerkUser.updatedAt,
				username: null,
			},
			type: "user.updated",
		});
		await expect(provider.verifyWebhook(request)).resolves.toMatchObject({
			eventId: "event_1",
			kind: "upsert",
			profile: { email: "user@example.com", externalAuthId: "user_clerk" },
		});

		clerk.verifyWebhook.mockResolvedValueOnce({
			data: {},
			type: "session.created",
		});
		await expect(provider.verifyWebhook(request)).resolves.toEqual({
			eventId: "event_1",
			kind: "ignored",
		});
	});

	it("maps deletion time and rejects invalid webhook signatures", async () => {
		const provider = new ClerkIdentityProvider(config);
		const request = new Request("http://localhost/webhooks/clerk", {
			headers: { "svix-id": "event_2", "svix-timestamp": "1788393600" },
		});
		clerk.verifyWebhook.mockResolvedValueOnce({
			data: { id: "user_clerk" },
			type: "user.deleted",
		});
		await expect(provider.verifyWebhook(request)).resolves.toEqual({
			eventId: "event_2",
			externalAuthId: "user_clerk",
			kind: "delete",
			providerUpdatedAt: new Date(1_788_393_600_000),
		});

		clerk.verifyWebhook.mockRejectedValueOnce(new Error("invalid signature"));
		await expect(provider.verifyWebhook(request)).rejects.toBeInstanceOf(
			InvalidIdentityWebhookError,
		);
	});
});
