import { createServerFn } from "@tanstack/react-start";
export const authConfigured = Boolean(
	import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
export function safeDestination(value: unknown): string {
	if (
		typeof value !== "string" ||
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("\\")
	)
		return "/dashboard";
	const url = new URL(value, "https://local.invalid");
	if (
		![
			"/dashboard",
			"/my-tasks",
			"/calendar",
			"/team",
			"/settings",
			"/invite",
		].includes(url.pathname) &&
		!/^\/board\/[0-9a-f-]{36}$/i.test(url.pathname)
	)
		return "/dashboard";
	const keys = url.pathname.startsWith("/board/")
		? ["taskId"]
		: ["/calendar", "/my-tasks"].includes(url.pathname)
			? ["taskId", "taskBoardId"]
			: url.pathname === "/team"
				? ["boardId"]
				: [];
	const query = new URLSearchParams();
	for (const key of keys) {
		const id = url.searchParams.get(key);
		if (
			id &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				id,
			)
		)
			query.set(key, id);
	}
	return url.pathname + (query.size ? `?${query}` : "");
}
export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) return { userId: null };
		const { auth } = await import("@clerk/tanstack-react-start/server");
		const session = await auth();
		return { userId: session.userId };
	},
);
