import { createFileRoute } from "@tanstack/react-router";
import { TaskViews } from "../components/workspace/task-views";
import { optionalId, requireSession } from "../lib/route-access";
export const Route = createFileRoute("/calendar")({
	head: () => ({ meta: [{ title: "Calendar · AI Kanban Board" }] }),
	beforeLoad: ({ location }) => requireSession(location.href),
	validateSearch: (
		s: Record<string, unknown>,
	): { taskId?: string; taskBoardId?: string } => ({
		taskId: optionalId(s.taskId),
		taskBoardId: optionalId(s.taskBoardId),
	}),
	component: () => <TaskViews calendar {...Route.useSearch()} />,
});
