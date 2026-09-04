import { createFileRoute, redirect } from "@tanstack/react-router";
import { Dashboard } from "../components/dashboard";
import { getSession } from "../lib/auth";
export const Route = createFileRoute("/dashboard")({
	beforeLoad: async () => {
		if (!(await getSession()).userId)
			throw redirect({ to: "/login", search: { redirect: "/dashboard" } });
	},
	head: () => ({ meta: [{ title: "Your workspace · AI Kanban Board" }] }),
	component: Dashboard,
});
