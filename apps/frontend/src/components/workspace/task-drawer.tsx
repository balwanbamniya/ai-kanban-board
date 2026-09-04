import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import type { BoardDetail, Task, TaskPage } from "../../lib/api";
import {
	accessLost,
	localDateTime,
	permissions,
	useApi,
	useBoard,
	usePages,
	useWrite,
} from "../../lib/workspace";
import { Button, ErrorNotice, Loading } from "../ui";
import { Modal, More } from "./primitives";
export function TaskDrawer({
	boardId,
	taskId,
	columnId,
	dueDate,
	parentTaskId,
	onClose,
	onOpenTask,
}: {
	boardId: string;
	taskId?: string;
	columnId?: string;
	dueDate?: string;
	parentTaskId?: string;
	onClose: () => void;
	onOpenTask?: (id: string) => void;
}) {
	const board = useBoard(boardId);
	const api = useApi();
	const task = useQuery({
		queryKey: ["task", boardId, taskId],
		staleTime: 0,
		queryFn: ({ signal }) =>
			api<Task>(`/boards/${boardId}/tasks/${taskId}`, { signal }),
		enabled: !!taskId && !accessLost(board.error),
	});
	return (
		<Modal
			wide
			title={taskId ? "A closer look" : "A new next step"}
			onClose={onClose}
		>
			{board.error && board.data && !accessLost(board.error) && (
				<ErrorNotice error={board.error} retry={() => void board.refetch()} />
			)}
			{task.error && task.data && !accessLost(task.error) && (
				<ErrorNotice error={task.error} retry={() => void task.refetch()} />
			)}
			{board.error && (!board.data || accessLost(board.error)) ? (
				<ErrorNotice error={board.error} />
			) : board.isPending ||
				(taskId &&
					(task.isPending ||
						(!task.isFetchedAfterMount && task.isFetching))) ? (
				<Loading />
			) : task.error && (!task.data || accessLost(task.error)) ? (
				<ErrorNotice error={task.error} />
			) : (
				board.data && (
					<TaskForm
						key={taskId || "new"}
						board={board.data}
						task={task.data}
						columnId={columnId}
						dueDate={dueDate}
						parentTaskId={parentTaskId}
						onClose={onClose}
						onOpenTask={onOpenTask}
					/>
				)
			)}
		</Modal>
	);
}
function TaskForm({
	board,
	task,
	columnId,
	dueDate,
	parentTaskId,
	onClose,
	onOpenTask,
}: {
	board: BoardDetail;
	task?: Task;
	columnId?: string;
	dueDate?: string;
	parentTaskId?: string;
	onClose: () => void;
	onOpenTask?: (id: string) => void;
}) {
	const permission = permissions(board.board);
	const mutation = useWrite<Task>();
	const [base, setBase] = useState(task);
	const saving = useRef(false);
	const [parent, setParent] = useState(
		task?.parentTaskId || parentTaskId || "",
	);
	const [formKey, setFormKey] = useState(0);
	const [search, setSearch] = useState("");
	const [addingChild, setAddingChild] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [message, setMessage] = useState("");
	const [destination, setDestination] = useState("");
	const parents = usePages<TaskPage>(
		"tasks",
		`/boards/${board.board.id}/tasks?search=${encodeURIComponent(search)}`,
		permission.write,
	);
	const children = usePages<TaskPage>(
		"tasks",
		`/boards/${board.board.id}/tasks?parentTaskId=${task?.id}`,
		!!task,
	);
	const path = `/boards/${board.board.id}/tasks`;
	async function save(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (mutation.isPending || saving.current || !permission.write) return;
		setMessage("");
		const data = new FormData(e.currentTarget);
		const due = String(data.get("dueDate") || "");
		const values = {
			title: String(data.get("title") || "").trim(),
			description: String(data.get("description") || "").trim() || null,
			priority: String(data.get("priority")),
			assigneeId: String(data.get("assigneeId") || "") || null,
			parentTaskId: String(data.get("parentTaskId") || "") || null,
			dueDate:
				base && due === localDateTime(base.dueDate)
					? base.dueDate
					: due
						? new Date(due).toISOString()
						: null,
		};
		if (!values.title) {
			setMessage("Give your task a title.");
			return;
		}
		const body: Record<string, unknown> = base
			? { version: base.version }
			: { columnId: String(data.get("columnId")) };
		for (const [k, v] of Object.entries(values)) {
			if (base) {
				if (base[k as keyof Task] !== v) body[k] = v;
			} else if (v !== null || k === "description") body[k] = v;
		}
		if (base && Object.keys(body).length === 1) {
			setMessage("No changes to save.");
			return;
		}
		saving.current = true;
		try {
			await mutation.mutateAsync({
				path: base ? `${path}/${base.id}` : path,
				method: base ? "PATCH" : "POST",
				body,
			});
			onClose();
		} catch {
			/* Keep the draft and show the API error. */
		} finally {
			saving.current = false;
		}
	}
	return (
		<>
			<form key={formKey} onSubmit={save}>
				<fieldset disabled={!permission.write || mutation.isPending}>
					<label className="field">
						Task title
						<input
							name="title"
							required
							maxLength={200}
							defaultValue={base?.title}
							placeholder="What’s the next step?"
						/>
					</label>
					<label className="field">
						Description
						<textarea
							name="description"
							maxLength={5000}
							rows={4}
							defaultValue={base?.description || ""}
						/>
					</label>
					<div className="form-row">
						<label className="field grow">
							Priority
							<select name="priority" defaultValue={base?.priority || "MEDIUM"}>
								{["LOW", "MEDIUM", "HIGH", "URGENT"].map((v) => (
									<option key={v}>{v}</option>
								))}
							</select>
						</label>
						<label className="field grow">
							Assignee
							<select name="assigneeId" defaultValue={base?.assigneeId || ""}>
								<option value="">Unassigned</option>
								{board.members.map((m) => (
									<option key={m.id} value={m.id}>
										{m.name}
									</option>
								))}
							</select>
						</label>
					</div>
					<label className="field">
						Due date and time{" "}
						<span>
							Your local timezone:{" "}
							{Intl.DateTimeFormat().resolvedOptions().timeZone}
						</span>
						<input
							name="dueDate"
							type="datetime-local"
							defaultValue={localDateTime(base?.dueDate || dueDate || null)}
						/>
					</label>
					{!base && (
						<label className="field">
							Column
							<select
								name="columnId"
								required
								defaultValue={columnId || board.columns[0]?.id}
							>
								{board.columns.map((c) => (
									<option key={c.id} value={c.id}>
										{c.title}
									</option>
								))}
							</select>
						</label>
					)}
					<label className="field">
						Find a parent task
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search task titles"
						/>
					</label>
					<label className="field">
						Parent task
						<select
							name="parentTaskId"
							value={parent}
							onChange={(e) => setParent(e.target.value)}
						>
							<option value="">No parent</option>
							{parent &&
								!parents.data?.pages.some((p) =>
									p.tasks.some((t) => t.id === parent),
								) && <option value={parent}>Current parent</option>}
							{parents.data?.pages
								.flatMap((p) => p.tasks)
								.filter((t) => t.id !== task?.id)
								.map((t) => (
									<option key={t.id} value={t.id}>
										{t.title}
									</option>
								))}
						</select>
					</label>
					{parents.error && (
						<ErrorNotice
							error={parents.error}
							retry={() => void parents.refetch()}
						/>
					)}
					<More query={parents} />
					{permission.write && (
						<Button type="submit" disabled={!board.columns.length}>
							{mutation.isPending ? "Saving…" : "Save task"}
						</Button>
					)}
				</fieldset>
			</form>
			{message && (
				<p role="status" className="form-note">
					{message}
				</p>
			)}
			{mutation.error && <ErrorNotice error={mutation.error} />}{" "}
			{task && base && task.version !== base.version && (
				<div className="notice">
					This task changed while you were editing. Your draft has been kept.
					<Button
						className="button-secondary button-small"
						onClick={() => {
							setBase(task);
							setParent(task.parentTaskId || "");
							setFormKey((k) => k + 1);
							mutation.reset();
						}}
					>
						Load latest and discard draft
					</Button>
				</div>
			)}
			{task && (
				<>
					<div className="drawer-section">
						<h3>Move task</h3>
						<p>Subtasks move independently of their parent.</p>
						<div className="form-row">
							<select
								aria-label="Destination column"
								value={destination}
								onChange={(e) => setDestination(e.target.value)}
								disabled={!permission.write}
							>
								<option value="">Choose a column</option>
								{board.columns
									.filter((c) => c.id !== task.columnId)
									.map((c) => (
										<option key={c.id} value={c.id}>
											{c.title}
											{c.isCompleted ? " · Completed" : ""}
										</option>
									))}
							</select>
							<Button
								disabled={
									!destination || !permission.write || mutation.isPending
								}
								onClick={async () => {
									try {
										const moved = await mutation.mutateAsync({
											path: `${path}/${task.id}/move`,
											body: { columnId: destination, version: task.version },
										});
										setBase(moved);
										setDestination("");
									} catch {}
								}}
							>
								Move
							</Button>
						</div>
					</div>
					<div className="drawer-section">
						<div className="panel-heading">
							<h3>Subtasks ({task._count.subtasks})</h3>
							{permission.write && (
								<Button
									className="button-small button-secondary"
									onClick={() => setAddingChild(true)}
								>
									Add subtask
								</Button>
							)}
						</div>
						{children.error && <ErrorNotice error={children.error} />}
						<ul className="plain-list">
							{children.data?.pages
								.flatMap((p) => p.tasks)
								.map((t) => (
									<li key={t.id}>
										<button type="button" onClick={() => onOpenTask?.(t.id)}>
											{t.column.isCompleted ? "✓ " : "○ "}
											{t.title}
										</button>
									</li>
								))}
						</ul>
						<More query={children} />
					</div>
					{permission.admin && (
						<div className="drawer-section">
							<Button
								className="button-secondary"
								onClick={() => setConfirmDelete(true)}
							>
								Delete task
							</Button>
						</div>
					)}
				</>
			)}
			{!permission.write && (
				<p className="notice">
					This task is read-only with your current access or board status.
				</p>
			)}
			{addingChild && task && (
				<TaskDrawer
					boardId={board.board.id}
					parentTaskId={task.id}
					columnId={task.columnId}
					onClose={() => setAddingChild(false)}
				/>
			)}{" "}
			{confirmDelete && task && (
				<Modal
					title="Delete this task?"
					description="This cannot be undone. Subtasks are kept and become independent tasks."
					onClose={() => setConfirmDelete(false)}
				>
					<Button
						disabled={mutation.isPending}
						onClick={async () => {
							try {
								await mutation.mutateAsync({
									path: `${path}/${task.id}`,
									method: "DELETE",
									body: { version: task.version },
								});
								onClose();
							} catch {
								setConfirmDelete(false);
							}
						}}
					>
						Delete task
					</Button>
				</Modal>
			)}
		</>
	);
}
