import { createFileRoute, notFound } from "@tanstack/react-router";
import { BoardPage } from "../components/workspace/board-page";
import { optionalId, requireSession } from "../lib/route-access";
export const Route = createFileRoute("/board/$boardId")({
	head: () => ({ meta: [{ title: "Board · AI Kanban Board" }] }),
	beforeLoad: ({ params, location }) => {
		if (!optionalId(params.boardId)) throw notFound();
		return requireSession(location.href);
	},
	validateSearch: (s: Record<string, unknown>): { taskId?: string } => ({
		taskId: optionalId(s.taskId),
	}),
	component: () => <BoardPage {...Route.useParams()} {...Route.useSearch()} />,
});
