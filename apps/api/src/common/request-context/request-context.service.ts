import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";

export interface RequestContext {
	requestId: string;
}

export const requestStorage = new AsyncLocalStorage<RequestContext>();

@Injectable()
export class RequestContextService {
	private readonly storage = requestStorage;

	run<T>(context: RequestContext, callback: () => T): T {
		return this.storage.run(context, callback);
	}

	get requestId(): string | undefined {
		return this.storage.getStore()?.requestId;
	}
}
