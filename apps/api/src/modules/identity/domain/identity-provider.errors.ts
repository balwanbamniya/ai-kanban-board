export class InvalidIdentityTokenError extends Error {
	constructor(message = "The session token is invalid or expired.") {
		super(message);
		this.name = "InvalidIdentityTokenError";
	}
}

export class IdentityProviderUnavailableError extends Error {
	constructor(message = "The identity provider is temporarily unavailable.") {
		super(message);
		this.name = "IdentityProviderUnavailableError";
	}
}

export class InvalidIdentityProfileError extends Error {
	constructor(
		message = "The identity provider returned an invalid user profile.",
	) {
		super(message);
		this.name = "InvalidIdentityProfileError";
	}
}

export class InvalidIdentityWebhookError extends Error {
	constructor(message = "The identity webhook signature is invalid.") {
		super(message);
		this.name = "InvalidIdentityWebhookError";
	}
}
