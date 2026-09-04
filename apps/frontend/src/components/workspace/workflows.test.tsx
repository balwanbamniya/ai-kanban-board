import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AiRun, BoardDetail, Task } from "../../lib/api";
import { safeDestination } from "../../lib/auth";
import { localDateTime, permissions } from "../../lib/workspace";
import { renderPage } from "../../test/render";
import { BoardPage } from "./board-page";
import { AiPanel } from "./board-panels";
import { InvitePage } from "./invite-page";
import { TaskDrawer } from "./task-drawer";
import { dayKey, monthDays, TaskViews } from "./task-views";

const identity = vi.hoisted(() => ({
	userId: "clerk-1" as string | null,
	isLoaded: true,
	getToken: async () => "session",
}));
vi.mock("../../lib/realtime", () => ({
	useRealtime: () => ({
		status: "Live",
		people: [],
		cursors: {},
		sendCursor: () => {},
	}),
}));
vi.mock("../providers", () => ({ useIdentity: () => identity }));
vi.mock("@clerk/tanstack-react-start", () => ({
	UserButton: () => <button type="button">Account</button>,
}));
const boardId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const taskId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const detail = {
	board: {
		id: boardId,
		title: "Launch",
		memberCount: 1,
		taskCount: 1,
		description: null,
		role: "OWNER",
		archivedAt: null,
		version: 1,
		color: "#BF4F2B",
		ownerId: userId,
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
	},
	columns: [
		{
			id: "todo",
			title: "To do",
			isCompleted: false,
			version: 1,
			taskCount: 1,
			sortKey: "a0",
			createdAt: "",
			updatedAt: "",
		},
		{
			id: "done",
			title: "Done",
			isCompleted: true,
			version: 1,
			taskCount: 0,
			sortKey: "a1",
			createdAt: "",
			updatedAt: "",
		},
	],
	members: [
		{
			id: userId,
			name: "Alex",
			email: "alex@example.com",
			role: "OWNER",
			avatarUrl: null,
			joinedAt: "",
		},
	],
} satisfies BoardDetail;
const task: Task = {
	id: taskId,
	boardId,
	columnId: "todo",
	title: "Original",
	description: null,
	assigneeId: null,
	assignee: null,
	parentTaskId: null,
	priority: "MEDIUM",
	dueDate: null,
	version: 1,
	sortKey: "a0",
	_count: { subtasks: 0 },
	column: {
		id: "todo",
		title: "To do",
		isCompleted: false,
		board: detail.board,
	},
};
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type":
				status >= 400 ? "application/problem+json" : "application/json",
		},
	});
function fixture(
	overrides?: (
		url: string,
		init?: RequestInit,
	) => Response | undefined | Promise<Response | undefined>,
) {
	const fn = vi.fn(async (url: string, init?: RequestInit) => {
		const override = await overrides?.(url, init);
		if (override) return override;
		if (url.endsWith("/users/me"))
			return json({ id: userId, name: "Alex", email: "alex@example.com" });
		if (url.includes("/boards?"))
			return json({ boards: [detail.board], nextCursor: null });
		if (url.endsWith(`/boards/${boardId}`)) return json(detail);
		if (url.endsWith(`/tasks/${taskId}`)) return json(task);
		if (url.includes("/tasks?")) return json({ tasks: [], nextCursor: null });
		throw new Error(`Unexpected fixture route ${url}`);
	});
	vi.stubGlobal("fetch", fn);
	return fn;
}
beforeEach(() => {
	identity.userId = "clerk-1";
	sessionStorage.clear();
	history.replaceState(null, "", "/");
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it("creates a task with normalized fields and invalidates workspace queries", async () => {
	const fetcher = fixture((url, init) =>
		init?.method === "POST" && url.endsWith("/tasks")
			? json(task, 201)
			: undefined,
	);
	const closed = vi.fn();
	const { client } = renderPage(
		<TaskDrawer boardId={boardId} columnId="todo" onClose={closed} />,
	);
	client.setQueryData(["tasks", "calendar"], { tasks: [] });
	const title = await screen.findByLabelText("Task title");
	fireEvent.change(title, { target: { value: "  Plan release  " } });
	fireEvent.click(screen.getByRole("button", { name: "Save task" }));
	await waitFor(() => expect(closed).toHaveBeenCalledOnce());
	const call = fetcher.mock.calls.find(([, init]) => init?.method === "POST");
	expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
		title: "Plan release",
		columnId: "todo",
		priority: "MEDIUM",
	});
	expect(client.getQueryState(["tasks", "calendar"])?.isInvalidated).toBe(true);
});
it("preserves an edit after conflict and requires explicit loading of the newer version", async () => {
	let newer = false;
	fixture((url, init) => {
		if (init?.method === "PATCH") {
			newer = true;
			return json(
				{
					detail: "Task changed. Refresh and try again.",
					requestId: "conflict-id",
				},
				409,
			);
		}
		if (url.endsWith(`/tasks/${taskId}`))
			return json(
				newer ? { ...task, title: "Someone else’s edit", version: 2 } : task,
			);
	});
	renderPage(
		<TaskDrawer boardId={boardId} taskId={taskId} onClose={() => {}} />,
	);
	const title = await screen.findByLabelText("Task title");
	fireEvent.change(title, { target: { value: "My unsaved draft" } });
	fireEvent.click(screen.getByRole("button", { name: "Save task" }));
	expect(await screen.findByText("Reference: conflict-id")).toBeInTheDocument();
	expect(title).toHaveValue("My unsaved draft");
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Load latest and discard draft",
		}),
	);
	expect(screen.getByLabelText("Task title")).toHaveValue(
		"Someone else’s edit",
	);
});
it.each(["VIEWER", "MEMBER"] as const)(
	"enforces %s task controls",
	async (role) => {
		fixture((url) =>
			url.endsWith(`/boards/${boardId}`)
				? json({ ...detail, board: { ...detail.board, role } })
				: undefined,
		);
		renderPage(
			<TaskDrawer boardId={boardId} taskId={taskId} onClose={() => {}} />,
		);
		const title = await screen.findByLabelText("Task title");
		if (role === "VIEWER") expect(title).toBeDisabled();
		else expect(title).toBeEnabled();
		expect(
			screen.queryByRole("button", { name: "Delete task" }),
		).not.toBeInTheDocument();
	},
);
it("defaults personal tasks to the current database user and incomplete work", async () => {
	const fetcher = fixture();
	renderPage(<TaskViews />);
	await screen.findByText("A little breathing room.");
	expect(
		fetcher.mock.calls.some(([url]) =>
			url.includes(`/tasks?completed=false&assigneeId=${userId}`),
		),
	).toBe(true);
	fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), {
		target: { value: "HIGH" },
	});
	await waitFor(() =>
		expect(
			fetcher.mock.calls.some(([url]) => url.includes("priority=HIGH")),
		).toBe(true),
	);
});
it("uses local calendar boundaries and exposes mobile date creation", async () => {
	fixture();
	renderPage(<TaskViews calendar />);
	expect(await screen.findByLabelText("Schedule a new task")).toHaveAttribute(
		"type",
		"date",
	);
	const days = monthDays(new Date(2026, 2, 15), true);
	expect(days).toHaveLength(42);
	expect(days[0]?.getDay()).toBe(1);
	expect(new Set(days.map(dayKey)).size).toBe(42);
	expect(localDateTime(new Date(2026, 2, 8, 17, 30).toISOString())).toBe(
		"2026-03-08T17:30",
	);
	fireEvent.change(screen.getByLabelText("Schedule a new task"), {
		target: { value: "2026-09-10" },
	});
	expect(await screen.findByRole("dialog")).toHaveTextContent(
		"Where does this task belong?",
	);
});
it("keeps invitation secrets out of authentication redirects", async () => {
	identity.userId = null;
	const token = "a".repeat(43);
	history.replaceState(null, "", `/invite#token=${token}`);
	const fetcher = fixture();
	renderPage(<InvitePage />);
	const link = await screen.findByRole("link", { name: "Sign in to join" });
	expect(link.getAttribute("href")).toContain("redirect=%2Finvite");
	expect(link.getAttribute("href")).not.toContain(token);
	expect(location.hash).toBe("");
	expect(sessionStorage.getItem("kanban-pending-invitation")).toContain(token);
	expect(fetcher).not.toHaveBeenCalled();
});
it("accepts an invitation only after an explicit click and clears its saved token", async () => {
	history.replaceState(null, "", `/invite#token=${"a".repeat(43)}`);
	const fetcher = fixture((url, init) =>
		url.endsWith("/invitations/accept") && init?.method === "POST"
			? json({ boardId })
			: undefined,
	);
	renderPage(<InvitePage />);
	const accept = await screen.findByRole("button", {
		name: "Accept invitation",
	});
	await waitFor(() => expect(accept).toBeEnabled());
	expect(
		fetcher.mock.calls.some(([url]) => url.endsWith("/invitations/accept")),
	).toBe(false);
	fireEvent.click(accept);
	await waitFor(() =>
		expect(sessionStorage.getItem("kanban-pending-invitation")).toBeNull(),
	);
});
it("reopens AI results, disables applied suggestions, and reuses application keys after failure", async () => {
	const run: AiRun = {
		id: "run-1",
		boardId,
		operationKind: "TASK_GENERATION",
		status: "SUCCEEDED",
		createdAt: "2026-09-04T12:00:00Z",
		errorMessage: null,
		output: {
			tasks: [
				{ title: "Applied", description: "Already done", priority: "LOW" },
				{ title: "Fresh", description: "Review me", priority: "HIGH" },
			],
		},
		suggestions: [{ suggestionIndex: 0, taskId }],
	};
	const fetcher = fixture((url, init) => {
		if (url.endsWith("/apply") && init?.method === "POST")
			return json({ detail: "Try again.", requestId: "retry" }, 503);
		if (url.includes("/ai/runs?"))
			return json({ runs: [run], nextCursor: null });
		if (url.endsWith("/ai/runs/run-1")) return json(run);
	});
	renderPage(<AiPanel board={detail} />);
	fireEvent.click(
		await screen.findByRole("button", { name: /Task suggestions/i }),
	);
	const applied = await screen.findByRole("checkbox", { name: /Applied/ });
	expect(applied).toBeDisabled();
	fireEvent.click(screen.getByRole("checkbox", { name: /Fresh/ }));
	const apply = screen.getByRole("button", { name: /Add .*selected|Apply/i });
	fireEvent.click(apply);
	await screen.findByRole("alert");
	await waitFor(() => expect(apply).toBeEnabled());
	fireEvent.click(apply);
	await waitFor(() =>
		expect(
			fetcher.mock.calls.filter(([url]) => url.endsWith("/apply")),
		).toHaveLength(2),
	);
	const calls = fetcher.mock.calls.filter(([url]) => url.endsWith("/apply"));
	expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual(
		JSON.parse(String(calls[1]?.[1]?.body)),
	);
});
it("matches archive and role permissions and rejects unsafe return destinations", () => {
	expect(permissions({ ...detail.board, role: "MEMBER" })).toMatchObject({
		write: true,
		admin: false,
		ai: false,
	});
	expect(
		permissions({ ...detail.board, archivedAt: "2026-09-04" }),
	).toMatchObject({
		write: false,
		admin: false,
		ai: false,
		readAi: false,
		readInvitations: true,
		owner: true,
	});
	for (const path of ["/calendar", "/invite", `/board/${boardId}`])
		expect(safeDestination(path)).toBe(path);
	for (const path of [
		"//evil.test",
		"https://evil.test",
		"/unknown",
		"/\\evil.test",
	])
		expect(safeDestination(path)).toBe("/dashboard");
	expect(safeDestination("/invite?token=secret#token=secret")).toBe("/invite");
});

it("keeps calendar dates at local midnight across both daylight-saving transitions", () => {
	expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
		"America/New_York",
	);
	for (const [month, date, hours] of [
		[2, 8, 23],
		[10, 1, 25],
	] as const) {
		const days = monthDays(new Date(2026, month, 15), true);
		const day = days.find(
			(d) => d.getMonth() === month && d.getDate() === date,
		);
		if (!day) throw new Error("Calendar fixture missing");
		const next = days[days.indexOf(day) + 1];
		if (!next) throw new Error("Calendar fixture missing");
		expect(day.getHours()).toBe(0);
		expect(next.getHours()).toBe(0);
		expect((next.getTime() - day.getTime()) / 3_600_000).toBe(hours);
	}
});

it("preserves validated task deep links through authentication without forwarding arbitrary parameters", () => {
	expect(
		safeDestination(`/board/${boardId}?taskId=${taskId}&token=secret`),
	).toBe(`/board/${boardId}?taskId=${taskId}`);
	expect(safeDestination("/calendar?taskId=invalid&token=secret")).toBe(
		"/calendar",
	);
});

it("keeps archived task viewing enabled while disabling dragging and mutations", async () => {
	fixture((url) => {
		if (url.endsWith(`/boards/${boardId}`))
			return json({
				...detail,
				board: { ...detail.board, archivedAt: "2026-09-04T00:00:00Z" },
			});
		if (url.includes("columnId=todo"))
			return json({ tasks: [task], nextCursor: null });
	});
	renderPage(<BoardPage boardId={boardId} />);
	expect(await screen.findByRole("button", { name: "Original" })).toBeEnabled();
	expect(screen.getByRole("button", { name: "Drag Original" })).toBeDisabled();
	expect(
		screen.queryByRole("button", { name: "Add column" }),
	).not.toBeInTheDocument();
});
it("discards private board and task data when membership is revoked", async () => {
	let denied = false;
	fixture((url) =>
		url.endsWith(`/boards/${boardId}`) && denied
			? json({ detail: "Board not found." }, 404)
			: undefined,
	);
	const { client } = renderPage(
		<TaskDrawer boardId={boardId} taskId={taskId} onClose={() => {}} />,
	);
	await screen.findByLabelText("Task title");
	denied = true;
	await client.invalidateQueries({ queryKey: ["board"] });
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Board not found.",
	);
	await waitFor(() =>
		expect(client.getQueryData(["board", "clerk-1", boardId])).toBeUndefined(),
	);
	expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
});
