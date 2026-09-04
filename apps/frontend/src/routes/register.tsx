import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthPage } from "../components/auth-page";
import { getSession, safeDestination } from "../lib/auth";
export const Route = createFileRoute("/register")({
	validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
		redirect: safeDestination(search.redirect),
	}),
	beforeLoad: async ({ search }) => {
		if ((await getSession()).userId)
			throw redirect({ href: safeDestination(search.redirect) });
	},
	head: () => ({ meta: [{ title: "Create account · AI Kanban Board" }] }),
	component: () => <AuthPage mode="register" />,
});
