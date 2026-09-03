import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { UsersModule } from "../users/users.module.js";
import { AuthenticationService } from "./application/authentication.service.js";
import { IDENTITY_PROVIDER } from "./domain/identity-provider.js";
import { ClerkIdentityProvider } from "./infrastructure/clerk-identity.provider.js";
import { AuthGuard } from "./presentation/auth.guard.js";
import { ClerkWebhookController } from "./presentation/clerk-webhook.controller.js";

@Module({
	imports: [UsersModule],
	controllers: [ClerkWebhookController],
	providers: [
		ClerkIdentityProvider,
		{ provide: IDENTITY_PROVIDER, useExisting: ClerkIdentityProvider },
		AuthenticationService,
		{ provide: APP_GUARD, useClass: AuthGuard },
	],
})
export class IdentityModule {}
