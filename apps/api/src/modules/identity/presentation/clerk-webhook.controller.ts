import {
	BadRequestException,
	Controller,
	HttpCode,
	HttpStatus,
	Inject,
	Post,
	type RawBodyRequest,
	Req,
} from "@nestjs/common";
import {
	ApiBadRequestResponse,
	ApiNoContentResponse,
	ApiTags,
	ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import type { Request as ExpressRequest } from "express";
import { AuthenticationService } from "../application/authentication.service.js";
import { InvalidIdentityWebhookError } from "../domain/identity-provider.errors.js";
import { Public } from "./public.decorator.js";

@ApiTags("webhooks")
@Controller("webhooks/clerk")
export class ClerkWebhookController {
	constructor(
		@Inject(AuthenticationService)
		private readonly authentication: AuthenticationService,
	) {}

	@Post()
	@Public()
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiNoContentResponse({ description: "The signed Clerk event was accepted." })
	@ApiBadRequestResponse({ description: "The webhook signature is invalid." })
	@ApiUnprocessableEntityResponse({
		description: "The signed webhook payload is invalid.",
	})
	async handle(@Req() request: RawBodyRequest<ExpressRequest>): Promise<void> {
		try {
			await this.authentication.processWebhook(this.toFetchRequest(request));
		} catch (error) {
			if (error instanceof InvalidIdentityWebhookError) {
				throw new BadRequestException("The webhook signature is invalid.");
			}
			throw error;
		}
	}

	private toFetchRequest(request: RawBodyRequest<ExpressRequest>): Request {
		if (!request.rawBody) {
			throw new BadRequestException("The webhook request body is unavailable.");
		}

		const headers = new Headers();
		for (const [name, value] of Object.entries(request.headers)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					headers.append(name, item);
				}
			} else if (value !== undefined) {
				headers.set(name, value);
			}
		}

		return new Request("http://localhost/webhooks/clerk", {
			body: request.rawBody.toString("utf8"),
			headers,
			method: "POST",
		});
	}
}
