import { redirect } from "@tanstack/react-router";
import { getSession, safeDestination } from "./auth";
export async function requireSession(path: string) {
	if (!(await getSession()).userId)
		throw redirect({
			to: "/login",
			search: { redirect: safeDestination(path) },
		});
}
export function optionalId(value: unknown) {
	return typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
		? value
		: undefined;
}
