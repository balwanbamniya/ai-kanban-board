import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "../components/workspace/team-page";
import { optionalId, requireSession } from "../lib/route-access";
export const Route = createFileRoute("/team")({
	head: () => ({ meta: [{ title: "Team · AI Kanban Board" }] }),
	beforeLoad: ({ location }) => requireSession(location.href),
	validateSearch: (s: Record<string, unknown>): { boardId?: string } => ({
		boardId: optionalId(s.boardId),
	}),
	component: () => <TeamPage {...Route.useSearch()} />,
});
