export class UserIdentityConflictError extends Error {
	constructor() {
		super("The identity profile conflicts with an existing application user.");
		this.name = "UserIdentityConflictError";
	}
}
