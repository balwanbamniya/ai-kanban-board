export interface AuthenticatedIdentity {
	externalAuthId: string;
	sessionId: string;
}

export interface IdentityProfile {
	avatarUrl?: string;
	email: string;
	externalAuthId: string;
	name: string;
	providerUpdatedAt: Date;
}

export type IdentityWebhookEvent =
	| {
			eventId: string;
			kind: "delete";
			externalAuthId: string;
			providerUpdatedAt: Date;
	  }
	| { eventId: string; kind: "ignored" }
	| { eventId: string; kind: "upsert"; profile: IdentityProfile };

export interface IdentityProvider {
	getProfile(externalAuthId: string): Promise<IdentityProfile>;
	verifySessionToken(token: string): Promise<AuthenticatedIdentity>;
	verifyWebhook(request: Request): Promise<IdentityWebhookEvent>;
}

export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");
