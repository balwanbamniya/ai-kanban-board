import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";
export const startInstance = createStart(() => ({
	requestMiddleware: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
		? [clerkMiddleware()]
		: [],
}));
