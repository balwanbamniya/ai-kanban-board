import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type { PlatformRole } from "../../../generated/prisma/enums.js";
import type { IdentityProfile } from "../../identity/domain/identity-provider.js";
import { UserIdentityConflictError } from "../domain/user.errors.js";

export interface CurrentUser {
	avatarUrl?: string;
	email: string;
	id: string;
	name: string;
	platformRole: PlatformRole;
}

const DELETED_USER_NAME = "Deleted user";

@Injectable()
export class UserSyncService {
	constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

	async findCurrentUser(externalAuthId: string): Promise<CurrentUser | null> {
		const user = await this.prisma.user.findUnique({
			where: { externalAuthId },
		});
		return user && !user.deletedAt && user.email
			? this.toCurrentUser({ ...user, email: user.email })
			: null;
	}

	async synchronize(profile: IdentityProfile): Promise<CurrentUser | null> {
		let update: { count: number };
		try {
			update = await this.prisma.user.updateMany({
				where: {
					externalAuthId: profile.externalAuthId,
					OR: [
						{ identityProviderUpdatedAt: null },
						{ identityProviderUpdatedAt: { lt: profile.providerUpdatedAt } },
					],
				},
				data: {
					avatarUrl: profile.avatarUrl ?? null,
					deletedAt: null,
					email: profile.email,
					identityProviderUpdatedAt: profile.providerUpdatedAt,
					name: profile.name,
				},
			});
		} catch (error) {
			this.throwIdentityConflict(error);
		}

		if (update.count === 0) {
			const existing = await this.prisma.user.findUnique({
				where: { externalAuthId: profile.externalAuthId },
			});
			if (!existing) {
				try {
					const created = await this.prisma.user.create({
						data: {
							avatarUrl: profile.avatarUrl,
							email: profile.email,
							externalAuthId: profile.externalAuthId,
							identityProviderUpdatedAt: profile.providerUpdatedAt,
							name: profile.name,
						},
					});
					return this.toCurrentUser({ ...created, email: profile.email });
				} catch (error) {
					const concurrent = await this.prisma.user.findUnique({
						where: { externalAuthId: profile.externalAuthId },
					});
					if (!concurrent) {
						this.throwIdentityConflict(error);
					}
					return this.synchronize(profile);
				}
			}
		}

		return this.findCurrentUser(profile.externalAuthId);
	}

	async softDelete(
		externalAuthId: string,
		providerUpdatedAt: Date,
	): Promise<void> {
		const update = await this.prisma.user.updateMany({
			where: {
				externalAuthId,
				OR: [
					{ identityProviderUpdatedAt: null },
					{ identityProviderUpdatedAt: { lt: providerUpdatedAt } },
				],
			},
			data: {
				avatarUrl: null,
				deletedAt: providerUpdatedAt,
				email: null,
				identityProviderUpdatedAt: providerUpdatedAt,
				name: DELETED_USER_NAME,
			},
		});

		if (update.count > 0) {
			return;
		}

		const existing = await this.prisma.user.findUnique({
			where: { externalAuthId },
		});
		if (existing) {
			return;
		}

		try {
			await this.prisma.user.create({
				data: {
					deletedAt: providerUpdatedAt,
					externalAuthId,
					identityProviderUpdatedAt: providerUpdatedAt,
					name: DELETED_USER_NAME,
				},
			});
		} catch (error) {
			const concurrent = await this.prisma.user.findUnique({
				where: { externalAuthId },
			});
			if (!concurrent) {
				throw error;
			}
			await this.softDelete(externalAuthId, providerUpdatedAt);
		}
	}

	private toCurrentUser(user: {
		avatarUrl: string | null;
		email: string;
		id: string;
		name: string;
		platformRole: PlatformRole;
	}): CurrentUser {
		return {
			avatarUrl: user.avatarUrl ?? undefined,
			email: user.email,
			id: user.id,
			name: user.name,
			platformRole: user.platformRole,
		};
	}

	private throwIdentityConflict(error: unknown): never {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			throw new UserIdentityConflictError();
		}
		throw error;
	}
}
