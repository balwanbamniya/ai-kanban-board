import {
	ServiceUnavailableException,
	UnauthorizedException,
	UnprocessableEntityException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSyncService } from "../../users/application/user-sync.service.js";
import {
	IdentityProviderUnavailableError,
	InvalidIdentityProfileError,
	InvalidIdentityTokenError,
} from "../domain/identity-provider.errors.js";
import type {
	IdentityProfile,
	IdentityProvider,
} from "../domain/identity-provider.js";
import { AuthenticationService } from "./authentication.service.js";

describe("AuthenticationService", () => {
	const currentUser = {
		email: "user@example.com",
		id: "00000000-0000-4000-8000-000000000001",
		name: "Example User",
		platformRole: "USER" as const,
	};
	const profile: IdentityProfile = {
		email: currentUser.email,
		externalAuthId: "user_clerk",
		name: currentUser.name,
		providerUpdatedAt: new Date("2026-09-03T00:00:00.000Z"),
	};
	let provider: IdentityProvider;
	let users: UserSyncService;

	beforeEach(() => {
		provider = {
			getProfile: vi.fn().mockResolvedValue(profile),
			verifySessionToken: vi.fn().mockResolvedValue({
				externalAuthId: profile.externalAuthId,
				sessionId: "session_1",
			}),
			verifyWebhook: vi
				.fn()
				.mockResolvedValue({ eventId: "event_1", kind: "ignored" }),
		};
		users = {
			findCurrentUser: vi.fn().mockResolvedValue(currentUser),
			softDelete: vi.fn(),
			synchronize: vi.fn().mockResolvedValue(currentUser),
		} as unknown as UserSyncService;
	});

	it("returns an existing local user without calling the Clerk profile API", async () => {
		const service = new AuthenticationService(provider, users);

		await expect(service.authenticate("token")).resolves.toEqual(currentUser);
		expect(provider.getProfile).not.toHaveBeenCalled();
	});

	it("provisions a user when its creation webhook has not arrived", async () => {
		vi.mocked(users.findCurrentUser).mockResolvedValue(null);
		const service = new AuthenticationService(provider, users);

		await expect(service.authenticate("token")).resolves.toEqual(currentUser);
		expect(provider.getProfile).toHaveBeenCalledWith(profile.externalAuthId);
		expect(users.synchronize).toHaveBeenCalledWith(profile);
	});

	it("maps only expected identity failures and preserves database errors", async () => {
		const service = new AuthenticationService(provider, users);
		vi.mocked(provider.verifySessionToken).mockRejectedValueOnce(
			new InvalidIdentityTokenError(),
		);
		await expect(service.authenticate("invalid")).rejects.toBeInstanceOf(
			UnauthorizedException,
		);

		vi.mocked(provider.verifySessionToken).mockRejectedValueOnce(
			new IdentityProviderUnavailableError(),
		);
		await expect(service.authenticate("unavailable")).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);

		const databaseError = new Error("database unavailable");
		vi.mocked(provider.verifySessionToken).mockResolvedValueOnce({
			externalAuthId: profile.externalAuthId,
			sessionId: "session_1",
		});
		vi.mocked(users.findCurrentUser).mockRejectedValueOnce(databaseError);
		await expect(service.authenticate("valid")).rejects.toBe(databaseError);
	});

	it("rejects an identity that remains inactive after synchronization", async () => {
		vi.mocked(users.findCurrentUser).mockResolvedValue(null);
		vi.mocked(users.synchronize).mockResolvedValue(null);
		const service = new AuthenticationService(provider, users);

		await expect(service.authenticate("token")).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
	});

	it("dispatches verified profile and deletion events idempotently", async () => {
		const service = new AuthenticationService(provider, users);
		vi.mocked(provider.verifyWebhook).mockResolvedValueOnce({
			eventId: "event_upsert",
			kind: "upsert",
			profile,
		});
		await service.processWebhook(new Request("http://localhost"));
		expect(users.synchronize).toHaveBeenCalledWith(profile);

		vi.mocked(provider.verifyWebhook).mockResolvedValueOnce({
			eventId: "event_delete",
			externalAuthId: profile.externalAuthId,
			kind: "delete",
			providerUpdatedAt: profile.providerUpdatedAt,
		});
		await service.processWebhook(new Request("http://localhost"));
		expect(users.softDelete).toHaveBeenCalledWith(
			profile.externalAuthId,
			profile.providerUpdatedAt,
		);
	});

	it("reports malformed signed webhook profiles as unprocessable", async () => {
		vi.mocked(provider.verifyWebhook).mockRejectedValue(
			new InvalidIdentityProfileError(),
		);
		const service = new AuthenticationService(provider, users);

		await expect(
			service.processWebhook(new Request("http://localhost")),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
	});
});
