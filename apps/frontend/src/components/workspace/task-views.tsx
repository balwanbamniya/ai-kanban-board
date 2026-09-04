import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { TaskPage } from "../../lib/api";
import { usePreferences } from "../../lib/preferences";
import {
	accessLost,
	params,
	useBoard,
	useMe,
	usePages,
} from "../../lib/workspace";
import { Button, ErrorNotice, Loading } from "../ui";
import { AppShell } from "./app-shell";
import { BoardSelector } from "./board-selector";
import { Modal, More } from "./primitives";
import { TaskDrawer } from "./task-drawer";
export function monthDays(month: Date, monday: boolean) {
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const offset = (first.getDay() + (monday ? 6 : 0)) % 7;
	first.setDate(first.getDate() - offset);
	return Array.from(
		{ length: 42 },
		(_, i) =>
			new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
	);
}
export function dayKey(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function TaskViews({
	calendar = false,
	taskId,
	taskBoardId,
}: {
	calendar?: boolean;
	taskId?: string;
	taskBoardId?: string;
}) {
	return (
		<AppShell>
			<TaskViewContent
				calendar={calendar}
				taskId={taskId}
				taskBoardId={taskBoardId}
			/>
		</AppShell>
	);
}
function TaskViewContent({
	calendar,
	taskId,
	taskBoardId,
}: {
	calendar: boolean;
	taskId?: string;
	taskBoardId?: string;
}) {
	const me = useMe();
	const nav = useNavigate();
	const [boardId, setBoard] = useState("");
	const [priority, setPriority] = useState("");
	const [completed, setCompleted] = useState(calendar ? "" : "false");
	const [search, setSearch] = useState("");
	const [dueFilter, setDueFilter] = useState("");
	const [assigned, setAssigned] = useState(calendar ? "" : "me");
	const [month, setMonth] = useState(() => new Date());
	const [createDate, setCreateDate] = useState<Date | null>(null);
	const [newBoard, setNewBoard] = useState("");
	const board = useBoard(boardId);
	const { preferences } = usePreferences();
	const days = monthDays(month, preferences.weekStart === "monday");
	const start = days[0] as Date;
	const end = new Date(
		start.getFullYear(),
		start.getMonth(),
		start.getDate() + 42,
	);
	const today = new Date();
	const tomorrow = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate() + 1,
	);
	const from = calendar
		? start.toISOString()
		: dueFilter === "today"
			? new Date(
					today.getFullYear(),
					today.getMonth(),
					today.getDate(),
				).toISOString()
			: undefined;
	const before = calendar
		? end.toISOString()
		: dueFilter === "overdue"
			? today.toISOString()
			: dueFilter === "today"
				? tomorrow.toISOString()
				: undefined;
	const query = params({
		boardId,
		priority,
		completed,
		search,
		assigneeId: assigned === "me" ? me.data?.id : assigned,
		dueFrom: from,
		dueBefore: before,
	});
	const tasks = usePages<TaskPage>(
		"tasks",
		`/tasks?${query}`,
		!!me.data,
		30_000,
	);
	const items = accessLost(tasks.error)
		? []
		: tasks.data?.pages.flatMap((p) => p.tasks) || [];
	const openTask = (id?: string, bid?: string) =>
		void nav({
			to: calendar ? "/calendar" : "/my-tasks",
			search: { taskId: id, taskBoardId: bid },
			replace: true,
		});
	return (
		<>
			<div className="workspace-page-heading">
				<div>
					<span className="eyebrow">
						{calendar ? "MAKE TIME FOR WHAT MATTERS" : "ONE THING AT A TIME"}
					</span>
					<h1>{calendar ? "A little perspective." : "Your next steps."}</h1>
					<p>
						{calendar
							? "Your board deadlines, together in one place."
							: "The work with your name on it, across your boards."}
					</p>
				</div>
			</div>
			<div className="filter-bar">
				<BoardSelector
					value={boardId}
					onChange={(id) => {
						setBoard(id);
						if (assigned !== "me") setAssigned("");
					}}
					all
					activeOnly
				/>
				<select
					aria-label="Assignee"
					value={assigned}
					onChange={(e) => setAssigned(e.target.value)}
				>
					<option value="">Everyone</option>
					<option value="me">Assigned to me</option>
					{board.data?.members
						.filter((m) => m.id !== me.data?.id)
						.map((m) => (
							<option key={m.id} value={m.id}>
								{m.name}
							</option>
						))}
				</select>
				<input
					aria-label="Search tasks"
					placeholder="Find a task…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<select
					aria-label="Completion"
					value={completed}
					onChange={(e) => setCompleted(e.target.value)}
				>
					<option value="">All stages</option>
					<option value="false">Incomplete</option>
					<option value="true">Completed</option>
				</select>
				<select
					aria-label="Priority"
					value={priority}
					onChange={(e) => setPriority(e.target.value)}
				>
					<option value="">All priorities</option>
					{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
						<option key={p}>{p}</option>
					))}
				</select>
				{!calendar && (
					<select
						aria-label="Due date filter"
						value={dueFilter}
						onChange={(e) => setDueFilter(e.target.value)}
					>
						<option value="">Any due date</option>
						<option value="today">Due today</option>
						<option value="overdue">Overdue</option>
					</select>
				)}
			</div>
			{tasks.error && (
				<ErrorNotice error={tasks.error} retry={() => void tasks.refetch()} />
			)}{" "}
			{tasks.isPending && <Loading />}
			{calendar && (
				<>
					<div className="calendar-toolbar">
						<Button
							className="button-secondary"
							aria-label="Previous month"
							onClick={() =>
								setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
							}
						>
							←
						</Button>
						<h2>
							{month.toLocaleDateString(undefined, {
								month: "long",
								year: "numeric",
							})}
						</h2>
						<Button
							className="button-secondary"
							aria-label="Next month"
							onClick={() =>
								setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
							}
						>
							→
						</Button>
						<Button
							className="button-secondary"
							onClick={() => setMonth(new Date())}
						>
							Today
						</Button>
					</div>
					<label className="field calendar-create-date">
						Schedule a new task
						<input
							type="date"
							aria-label="Schedule a new task"
							onChange={(e) => {
								if (!e.target.value) return;
								setNewBoard(boardId);
								setCreateDate(new Date(`${e.target.value}T17:00:00`));
								e.target.value = "";
							}}
						/>
					</label>
					<div className="calendar-grid">
						{days.slice(0, 7).map((day) => (
							<div className="weekday" key={dayKey(day)}>
								{day.toLocaleDateString(undefined, { weekday: "short" })}
							</div>
						))}
						{days.map((day) => (
							<section
								className={`calendar-day ${day.getMonth() !== month.getMonth() ? "outside-month" : ""}`}
								key={dayKey(day)}
							>
								<button
									type="button"
									className={dayKey(day) === dayKey(today) ? "today" : ""}
									aria-label={`Create task on ${day.toLocaleDateString()}`}
									onClick={() => {
										setNewBoard(boardId);
										setCreateDate(
											new Date(
												day.getFullYear(),
												day.getMonth(),
												day.getDate(),
												17,
											),
										);
									}}
								>
									{day.getDate()}
								</button>
								{items
									.filter(
										(t) =>
											t.dueDate && dayKey(new Date(t.dueDate)) === dayKey(day),
									)
									.map((t) => (
										<button
											type="button"
											className="calendar-task"
											style={{ borderLeftColor: t.column.board.color }}
											key={t.id}
											onClick={() => openTask(t.id, t.boardId)}
										>
											{t.column.isCompleted ? "✓ " : ""}
											{t.title}
										</button>
									))}
							</section>
						))}
					</div>
				</>
			)}
			<section className={calendar ? "calendar-agenda surface" : "surface"}>
				<h2>{calendar ? "Agenda" : "Your tasks"}</h2>
				{items.length === 0 && !tasks.isPending && !tasks.error && (
					<div className="empty-state">
						<h3>A little breathing room.</h3>
						<p>No tasks match these filters.</p>
					</div>
				)}
				<ul className="task-list">
					{items.map((t) => (
						<li key={t.id}>
							<button type="button" onClick={() => openTask(t.id, t.boardId)}>
								<span
									className={`status-dot ${t.column.isCompleted ? "completed-dot" : ""}`}
								/>
								<div className="grow">
									<strong>{t.title}</strong>
									<p>
										{t.column.board.title} · {t.column.title} · {t.priority}
									</p>
								</div>
								<time>
									{t.dueDate
										? new Date(t.dueDate).toLocaleString(undefined, {
												month: "short",
												day: "numeric",
												hour: "2-digit",
												minute: "2-digit",
											})
										: "No due date"}
								</time>
							</button>
						</li>
					))}
				</ul>
				<More query={tasks} />
				{tasks.hasNextPage && (
					<p className="form-note">
						More tasks are available. Load all pages to see every matching
						deadline.
					</p>
				)}
			</section>
			{taskId && taskBoardId && (
				<TaskDrawer
					boardId={taskBoardId}
					taskId={taskId}
					onClose={() => openTask()}
					onOpenTask={(id) => openTask(id, taskBoardId)}
				/>
			)}{" "}
			{createDate &&
				(newBoard ? (
					<TaskDrawer
						boardId={newBoard}
						dueDate={createDate.toISOString()}
						onClose={() => setCreateDate(null)}
					/>
				) : (
					<Modal
						title="Where does this task belong?"
						onClose={() => setCreateDate(null)}
					>
						<BoardSelector value={newBoard} onChange={setNewBoard} activeOnly />
					</Modal>
				))}
		</>
	);
}
