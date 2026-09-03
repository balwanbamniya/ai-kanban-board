import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../../database/prisma.service.js";
import type { IdentityProfile } from "../../identity/domain/identity-provider.js";
import { UserSyncService } from "./user-sync.service.js";

describe("UserSyncService", () => {
	const profile: IdentityProfile = {
		email: "user@example.com",
		externalAuthId: "user_clerk",
		name: "Example User",
		providerUpdatedAt: new Date("2026-09-03T00:00:00.000Z"),
	};
	const persistedUser = {
		avatarUrl: null,
		createdAt: new Date(),
		deletedAt: null,
		email: profile.email,
		externalAuthId: profile.externalAuthId,
		id: "00000000-0000-4000-8000-000000000001",
		identityProviderUpdatedAt: profile.providerUpdatedAt,
		name: profile.name,
		platformRole: "USER" as const,
		updatedAt: new Date(),
	};
	let prisma: PrismaService;

	beforeEach(() => {
		prisma = {
			user: {
				create: vi.fn(),
				findUnique: vi.fn(),
				updateMany: vi.fn(),
			},
		} as unknown as PrismaService;
	});

	it("returns only active users with an email address", async () => {
		vi.mocked(prisma.user.findUnique).mockResolvedValue(persistedUser);
		const service = new UserSyncService(prisma);

		await expect(
			service.findCurrentUser(profile.externalAuthId),
		).resolves.toEqual({
			email: profile.email,
			id: persistedUser.id,
			name: profile.name,
			platformRole: "USER",
		});

		vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
			...persistedUser,
			deletedAt: new Date(),
			email: null,
		});
		await expect(
			service.findCurrentUser(profile.externalAuthId),
		).resolves.toBeNull();
	});

	it("creates a missing user without accepting a conflicting email account", async () => {
		vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
		vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
		vi.mocked(prisma.user.create).mockResolvedValue(persistedUser);
		const service = new UserSyncService(prisma);

		await expect(service.synchronize(profile)).resolves.toMatchObject({
			email: profile.email,
			id: persistedUser.id,
		});

		const conflict = new Error("unique email conflict");
		vi.mocked(prisma.user.create).mockRejectedValueOnce(conflict);
		await expect(service.synchronize(profile)).rejects.toBe(conflict);
	});

	it("uses a conditional update so duplicate and stale profiles are no-ops", async () => {
		vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
		vi.mocked(prisma.user.findUnique).mockResolvedValue(persistedUser);
		const service = new UserSyncService(prisma);

		await expect(service.synchronize(profile)).resolves.toMatchObject({
			email: profile.email,
		});
		expect(prisma.user.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					externalAuthId: profile.externalAuthId,
				}),
			}),
		);
		expect(prisma.user.create).not.toHaveBeenCalled();
	});

	it("soft-deletes profiles without changing authorization relationships", async () => {
		vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
		const service = new UserSyncService(prisma);

		await service.softDelete(profile.externalAuthId, profile.providerUpdatedAt);
		expect(prisma.user.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					avatarUrl: null,
					deletedAt: profile.providerUpdatedAt,
					email: null,
				}),
			}),
		);
	});
});
