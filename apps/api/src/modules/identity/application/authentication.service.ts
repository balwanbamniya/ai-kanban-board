import {
	ConflictException,
	Inject,
	Injectable,
	ServiceUnavailableException,
	UnauthorizedException,
	UnprocessableEntityException,
} from "@nestjs/common";
import type { CurrentUser } from "../../users/application/user-sync.service.js";
import { UserSyncService } from "../../users/application/user-sync.service.js";
import { UserIdentityConflictError } from "../../users/domain/user.errors.js";
import {
	IdentityProviderUnavailableError,
	InvalidIdentityProfileError,
	InvalidIdentityTokenError,
} from "../domain/identity-provider.errors.js";
import type {
	IdentityProvider,
	IdentityWebhookEvent,
} from "../domain/identity-provider.js";
import { IDENTITY_PROVIDER } from "../domain/identity-provider.js";

@Injectable()
export class AuthenticationService {
	constructor(
		@Inject(IDENTITY_PROVIDER)
		private readonly identityProvider: IdentityProvider,
		@Inject(UserSyncService)
		private readonly users: UserSyncService,
	) {}

	async authenticate(token: string): Promise<CurrentUser> {
		try {
			const identity = await this.identityProvider.verifySessionToken(token);
			const existing = await this.users.findCurrentUser(
				identity.externalAuthId,
			);
			if (existing) {
				return existing;
			}

			const profile = await this.identityProvider.getProfile(
				identity.externalAuthId,
			);
			const synchronized = await this.users.synchronize(profile);
			if (!synchronized) {
				throw new InvalidIdentityTokenError();
			}
			return synchronized;
		} catch (error) {
			if (error instanceof UserIdentityConflictError) {
				throw new ConflictException(
					"The authenticated identity conflicts with an existing user.",
				);
			}
			if (error instanceof InvalidIdentityTokenError) {
				throw new UnauthorizedException("Invalid or expired session token.");
			}
			if (
				error instanceof IdentityProviderUnavailableError ||
				error instanceof InvalidIdentityProfileError
			) {
				throw new ServiceUnavailableException(
					"The identity provider is temporarily unavailable.",
				);
			}
			throw error;
		}
	}

	async processWebhook(request: Request): Promise<void> {
		let event: IdentityWebhookEvent;
		try {
			event = await this.identityProvider.verifyWebhook(request);
		} catch (error) {
			if (error instanceof InvalidIdentityProfileError) {
				throw new UnprocessableEntityException(
					"The identity webhook payload is invalid.",
				);
			}
			throw error;
		}

		try {
			if (event.kind === "upsert") {
				await this.users.synchronize(event.profile);
				return;
			}
			if (event.kind === "delete") {
				await this.users.softDelete(
					event.externalAuthId,
					event.providerUpdatedAt,
				);
			}
		} catch (error) {
			if (error instanceof UserIdentityConflictError) {
				throw new ConflictException(
					"The identity conflicts with an existing user.",
				);
			}
			throw error;
		}
	}
}
