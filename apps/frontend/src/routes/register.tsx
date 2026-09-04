import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthPage } from "../components/auth-page";
import { getSession } from "../lib/auth";
export const Route = createFileRoute("/register")({
	beforeLoad: async () => {
		if ((await getSession()).userId) throw redirect({ to: "/dashboard" });
	},
	head: () => ({ meta: [{ title: "Create account · AI Kanban Board" }] }),
	component: () => <AuthPage mode="register" />,
});
