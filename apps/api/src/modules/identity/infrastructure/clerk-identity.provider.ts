import { createClerkClient, verifyToken } from "@clerk/backend";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../config/app-config.service.js";
import {
	IdentityProviderUnavailableError,
	InvalidIdentityProfileError,
	InvalidIdentityTokenError,
	InvalidIdentityWebhookError,
} from "../domain/identity-provider.errors.js";
import type {
	AuthenticatedIdentity,
	IdentityProfile,
	IdentityProvider,
	IdentityWebhookEvent,
} from "../domain/identity-provider.js";

interface ClerkEmailAddress {
	emailAddress: string;
	id: string;
}

interface ClerkProfile {
	emailAddresses: ClerkEmailAddress[];
	firstName: string | null;
	id: string;
	imageUrl: string;
	lastName: string | null;
	primaryEmailAddressId: string | null;
	updatedAt: number;
	username: string | null;
}

interface ClerkWebhookProfile {
	email_addresses: Array<{ email_address: string; id: string }>;
	first_name: string | null;
	id: string;
	image_url: string;
	last_name: string | null;
	primary_email_address_id: string | null;
	updated_at: number;
	username: string | null;
}

@Injectable()
export class ClerkIdentityProvider implements IdentityProvider {
	private readonly client;

	constructor(
		@Inject(AppConfigService) private readonly config: AppConfigService,
	) {
		this.client = createClerkClient({ secretKey: config.clerkSecretKey });
	}

	async verifySessionToken(token: string): Promise<AuthenticatedIdentity> {
		try {
			const claims = await verifyToken(token, {
				audience: this.config.clerkAudience.length
					? this.config.clerkAudience
					: undefined,
				authorizedParties: this.config.clerkAuthorizedParties,
				jwtKey: this.config.clerkJwtKey,
			});

			if (!claims.sub || typeof claims.sid !== "string" || !claims.sid) {
				throw new InvalidIdentityTokenError();
			}

			return {
				externalAuthId: claims.sub,
				sessionId: claims.sid,
			};
		} catch (error) {
			if (error instanceof InvalidIdentityTokenError) {
				throw error;
			}
			throw new InvalidIdentityTokenError();
		}
	}

	async getProfile(externalAuthId: string): Promise<IdentityProfile> {
		try {
			const user = await this.client.users.getUser(externalAuthId);
			const profile = this.mapProfile(user);
			if (profile.externalAuthId !== externalAuthId) {
				throw new InvalidIdentityProfileError();
			}
			return profile;
		} catch (error) {
			if (error instanceof InvalidIdentityProfileError) {
				throw error;
			}

			const status = this.httpStatus(error);
			if (status === 404) {
				throw new InvalidIdentityTokenError();
			}
			throw new IdentityProviderUnavailableError();
		}
	}

	async verifyWebhook(request: Request): Promise<IdentityWebhookEvent> {
		let event: Awaited<ReturnType<typeof verifyWebhook>>;
		try {
			event = await verifyWebhook(request, {
				signingSecret: this.config.clerkWebhookSigningSecret,
			});
		} catch {
			throw new InvalidIdentityWebhookError();
		}

		const eventId = request.headers.get("svix-id")?.trim();
		if (!eventId) {
			throw new InvalidIdentityWebhookError();
		}

		if (event.type === "user.created" || event.type === "user.updated") {
			return {
				eventId,
				kind: "upsert",
				profile: this.mapWebhookProfile(event.data),
			};
		}

		if (event.type === "user.deleted") {
			const externalAuthId = event.data.id;
			const timestamp = Number(request.headers.get("svix-timestamp"));
			if (
				!externalAuthId ||
				!Number.isSafeInteger(timestamp) ||
				timestamp <= 0
			) {
				throw new InvalidIdentityProfileError();
			}
			return {
				eventId,
				externalAuthId,
				kind: "delete",
				providerUpdatedAt: new Date(timestamp * 1000),
			};
		}

		return { eventId, kind: "ignored" };
	}

	private mapProfile(user: ClerkProfile): IdentityProfile {
		return this.toIdentityProfile(user);
	}

	private mapWebhookProfile(user: unknown): IdentityProfile {
		if (!this.isClerkWebhookProfile(user)) {
			throw new InvalidIdentityProfileError();
		}
		return this.toIdentityProfile({
			emailAddresses: user.email_addresses.map((address) => ({
				emailAddress: address.email_address,
				id: address.id,
			})),
			firstName: user.first_name,
			id: user.id,
			imageUrl: user.image_url,
			lastName: user.last_name,
			primaryEmailAddressId: user.primary_email_address_id,
			updatedAt: user.updated_at,
			username: user.username,
		});
	}

	private toIdentityProfile(user: ClerkProfile): IdentityProfile {
		const emailAddress = user.emailAddresses.find(
			(address) => address.id === user.primaryEmailAddressId,
		);
		const normalizedEmail = emailAddress?.emailAddress.trim().toLowerCase();
		const providerUpdatedAt = new Date(user.updatedAt);
		if (
			!user.id ||
			!normalizedEmail ||
			!Number.isSafeInteger(user.updatedAt) ||
			user.updatedAt <= 0 ||
			Number.isNaN(providerUpdatedAt.getTime())
		) {
			throw new InvalidIdentityProfileError();
		}

		const name = [user.firstName, user.lastName]
			.filter((part): part is string => Boolean(part?.trim()))
			.map((part) => part.trim())
			.join(" ")
			.trim();

		return {
			avatarUrl: user.imageUrl || undefined,
			email: normalizedEmail,
			externalAuthId: user.id,
			name: name || user.username?.trim() || normalizedEmail,
			providerUpdatedAt,
		};
	}

	private httpStatus(error: unknown): number | undefined {
		if (typeof error !== "object" || error === null || !("status" in error)) {
			return undefined;
		}
		return typeof error.status === "number" ? error.status : undefined;
	}

	private isClerkWebhookProfile(value: unknown): value is ClerkWebhookProfile {
		if (typeof value !== "object" || value === null) {
			return false;
		}
		const profile = value as Partial<ClerkWebhookProfile>;
		return (
			typeof profile.id === "string" &&
			typeof profile.updated_at === "number" &&
			typeof profile.image_url === "string" &&
			(profile.first_name === null || typeof profile.first_name === "string") &&
			(profile.last_name === null || typeof profile.last_name === "string") &&
			(profile.username === null || typeof profile.username === "string") &&
			(profile.primary_email_address_id === null ||
				typeof profile.primary_email_address_id === "string") &&
			Array.isArray(profile.email_addresses) &&
			profile.email_addresses.every(
				(address) =>
					typeof address?.id === "string" &&
					typeof address.email_address === "string",
			)
		);
	}
}
