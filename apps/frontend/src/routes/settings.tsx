import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../components/workspace/settings-page";
import { requireSession } from "../lib/route-access";
export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: "Settings · AI Kanban Board" }] }),
	beforeLoad: ({ location }) => requireSession(location.href),
	component: SettingsPage,
});
