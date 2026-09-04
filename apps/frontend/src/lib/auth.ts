import { createServerFn } from "@tanstack/react-start";
export const authConfigured = Boolean(
	import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
export function safeDestination(value: unknown): "/dashboard" {
	return value === "/dashboard" ? value : "/dashboard";
}
export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) return { userId: null };
		const { auth } = await import("@clerk/tanstack-react-start/server");
		const session = await auth();
		return { userId: session.userId };
	},
);
