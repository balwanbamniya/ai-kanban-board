import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthPage } from "../components/auth-page";
import { getSession, safeDestination } from "../lib/auth";
export const Route = createFileRoute("/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): { redirect?: "/dashboard" } => ({
		redirect: safeDestination(search.redirect),
	}),
	beforeLoad: async () => {
		if ((await getSession()).userId) throw redirect({ to: "/dashboard" });
	},
	head: () => ({ meta: [{ title: "Log in · AI Kanban Board" }] }),
	component: () => <AuthPage mode="login" />,
});
