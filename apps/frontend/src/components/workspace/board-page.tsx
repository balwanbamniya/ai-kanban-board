import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, GripVertical, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { BoardDetail, Column, Task, TaskPage } from "../../lib/api";
import { usePreferences } from "../../lib/preferences";
import { useRealtime } from "../../lib/realtime";
import {
	accessLost,
	params,
	permissions,
	useBoard,
	usePages,
	useWrite,
} from "../../lib/workspace";
import { Button, ErrorNotice, Loading } from "../ui";
import { AppShell } from "./app-shell";
import { ActivityPanel, AiPanel } from "./board-panels";
import { ActionMenu, Modal, More } from "./primitives";
import { TaskDrawer } from "./task-drawer";
export function BoardPage({
	boardId,
	taskId,
}: {
	boardId: string;
	taskId?: string;
}) {
	return (
		<AppShell>
			<BoardContent boardId={boardId} taskId={taskId} />
		</AppShell>
	);
}
function BoardContent({
	boardId,
	taskId,
}: {
	boardId: string;
	taskId?: string;
}) {
	const board = useBoard(boardId);
	const nav = useNavigate();
	const [createColumn, setCreateColumn] = useState(false);
	const [newTask, setNewTask] = useState<string | null>(null);
	const [panel, setPanel] = useState<"ai" | "activity" | "settings" | null>(
		null,
	);
	const [search, setSearch] = useState("");
	const [assignee, setAssignee] = useState("");
	const [priority, setPriority] = useState("");
	const move = useWrite();
	const { preferences } = usePreferences();
	const live = useRealtime(boardId, board.isSuccess && !board.error);
	const openTask = (id?: string) =>
		void nav({
			to: "/board/$boardId",
			params: { boardId },
			search: id ? { taskId: id } : {},
			replace: true,
		});
	if (board.error && (!board.data || accessLost(board.error)))
		return (
			<ErrorNotice error={board.error} retry={() => void board.refetch()} />
		);
	if (!board.data) return <Loading />;
	const data = board.data;
	const permission = permissions(data.board);
	const filtered = !!(search || assignee || priority);
	return (
		<>
			{board.error && (
				<ErrorNotice error={board.error} retry={() => void board.refetch()} />
			)}
			<div className="workspace-page-heading">
				<div>
					<span className="eyebrow">YOUR NEXT CHAPTER</span>
					<h1>{data.board.title}</h1>
					<p>{data.board.description}</p>
				</div>
				<div className="toolbar">
					<Button
						className="button-secondary"
						onClick={() => setPanel("activity")}
					>
						Activity
					</Button>
					{permission.readAi && (
						<Button className="button-secondary" onClick={() => setPanel("ai")}>
							✳ AI assistant
						</Button>
					)}
					<Button
						className="button-secondary"
						onClick={() => setPanel("settings")}
					>
						Board settings
					</Button>
				</div>
			</div>
			<div className="board-meta">
				<span
					className={`connection ${live.status === "Live" ? "connected" : ""}`}
				>
					{live.status}
				</span>
				<span>{live.people.map((p) => p.name).join(", ")}</span>
				<Link to="/team" search={{ boardId }}>
					Manage team ↗
				</Link>
			</div>
			{data.board.archivedAt && (
				<p className="notice">
					Archived board · read-only. The owner can restore it in board
					settings.
				</p>
			)}
			{permission.admin && !data.columns.some((c) => c.isCompleted) && (
				<p className="notice">
					Which column means done? Mark a completed column through its Actions
					menu to enable completion filters.
				</p>
			)}
			<div className="filter-bar">
				<input
					aria-label="Search board tasks"
					placeholder="Search this board…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<select
					aria-label="Filter assignee"
					value={assignee}
					onChange={(e) => setAssignee(e.target.value)}
				>
					<option value="">Everyone</option>
					{data.members.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name}
						</option>
					))}
				</select>
				<select
					aria-label="Filter priority"
					value={priority}
					onChange={(e) => setPriority(e.target.value)}
				>
					<option value="">All priorities</option>
					{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
						<option key={p}>{p}</option>
					))}
				</select>
				{permission.admin && (
					<Button
						className="button-secondary"
						onClick={() => setCreateColumn(true)}
					>
						Add column
					</Button>
				)}
			</div>
			{filtered && (
				<p className="form-note">
					Clear filters to reorder tasks. You can still move a task from its
					details.
				</p>
			)}
			{move.error && <ErrorNotice error={move.error} />}
			<DragDropProvider
				onDragEnd={async (event) => {
					if (event.canceled || !permission.write || filtered || move.isPending)
						return;
					const source = event.operation.source?.data.task as Task | undefined;
					const target = event.operation.target?.data as
						| { columnId?: string; beforeTaskId?: string }
						| undefined;
					if (!source || !target?.columnId || source.id === target.beforeTaskId)
						return;
					try {
						await move.mutateAsync({
							path: `/boards/${boardId}/tasks/${source.id}/move`,
							body: {
								version: source.version,
								columnId: target.columnId,
								beforeTaskId: target.beforeTaskId,
							},
						});
					} catch {}
				}}
			>
				<div
					className="kanban-scroll"
					onPointerMove={(event) => {
						if (!preferences.cursors) return;
						const r = event.currentTarget.getBoundingClientRect();
						live.sendCursor(
							event.clientX - r.left + event.currentTarget.scrollLeft,
							event.clientY - r.top + event.currentTarget.scrollTop,
						);
					}}
				>
					{data.columns.map((column) => (
						<KanbanColumn
							key={column.id}
							column={column}
							board={data}
							filters={{ search, assigneeId: assignee, priority }}
							disabled={filtered || !permission.write || move.isPending}
							onTask={openTask}
							onCreate={() => setNewTask(column.id)}
						/>
					))}
					{data.columns.length === 0 && (
						<div className="empty-state">
							<h2>A clear place to begin.</h2>
							<p>Add a column to start organizing tasks.</p>
						</div>
					)}
					{preferences.cursors &&
						Object.entries(live.cursors).map(([id, pos]) => (
							<span
								className="collaborator-cursor"
								key={id}
								style={{ left: pos.x, top: pos.y }}
							>
								↖ {live.people.find((p) => p.id === id)?.name || "Collaborator"}
							</span>
						))}
				</div>
			</DragDropProvider>
			{taskId && (
				<TaskDrawer
					boardId={boardId}
					taskId={taskId}
					onClose={() => openTask()}
					onOpenTask={openTask}
				/>
			)}{" "}
			{newTask && permission.write && (
				<TaskDrawer
					boardId={boardId}
					columnId={newTask}
					onClose={() => setNewTask(null)}
				/>
			)}{" "}
			{createColumn && permission.admin && (
				<ColumnEditor board={data} onClose={() => setCreateColumn(false)} />
			)}{" "}
			{panel && (
				<Modal
					wide
					title={
						panel === "ai"
							? "A little AI inspiration"
							: panel === "activity"
								? "The story so far"
								: "Board settings"
					}
					onClose={() => setPanel(null)}
				>
					{panel === "ai" ? (
						permission.readAi ? (
							<AiPanel board={data} />
						) : (
							<p>
								AI access is unavailable for your current role or an archived
								board.
							</p>
						)
					) : panel === "activity" ? (
						<ActivityPanel boardId={boardId} />
					) : (
						<BoardSettings board={data} />
					)}
				</Modal>
			)}
		</>
	);
}
function KanbanColumn({
	column,
	board,
	filters,
	disabled,
	onTask,
	onCreate,
}: {
	column: Column;
	board: BoardDetail;
	filters: Record<string, string>;
	disabled: boolean;
	onTask: (id: string) => void;
	onCreate: () => void;
}) {
	const list = usePages<TaskPage>(
		"tasks",
		`/boards/${board.board.id}/tasks?${params({ ...filters, columnId: column.id })}`,
	);
	const { ref } = useDroppable({
		id: `column-${column.id}`,
		data: { columnId: column.id },
		disabled,
	});
	const [editing, setEditing] = useState(false);
	const write = useWrite();
	const permission = permissions(board.board);
	const index = board.columns.findIndex((c) => c.id === column.id);
	async function reorder(offset: number) {
		const columns = [...board.columns];
		const other = columns[index + offset];
		if (!other) return;
		columns[index] = other;
		columns[index + offset] = column;
		try {
			await write.mutateAsync({
				path: `/boards/${board.board.id}/columns/reorder`,
				body: {
					columns: columns.map((c) => ({ id: c.id, version: c.version })),
				},
			});
		} catch {}
	}
	return (
		<section ref={ref} className="kanban-column">
			<header>
				<span
					className={`status-dot ${column.isCompleted ? "completed-dot" : ""}`}
				/>
				<h2>{column.title}</h2>
				<span className="count">{column.taskCount}</span>
				{permission.admin && (
					<ActionMenu
						items={[
							{ label: "Edit column", action: () => setEditing(true) },
							{
								label: "Move left",
								action: () => void reorder(-1),
								disabled: index === 0 || write.isPending,
							},
							{
								label: "Move right",
								action: () => void reorder(1),
								disabled: index === board.columns.length - 1 || write.isPending,
							},
						]}
					/>
				)}
			</header>
			{list.isPending && <Loading />}
			{list.error && (
				<ErrorNotice error={list.error} retry={() => void list.refetch()} />
			)}{" "}
			{write.error && <ErrorNotice error={write.error} />}
			<div className="kanban-tasks">
				{list.data?.pages
					.flatMap((p) => p.tasks)
					.map((task) => (
						<TaskTile
							key={task.id}
							task={task}
							disabled={disabled}
							onOpen={() => onTask(task.id)}
						/>
					))}
			</div>
			<More query={list} />
			{permission.write && (
				<Button className="add-task" onClick={onCreate}>
					<Plus size={15} />
					Add task
				</Button>
			)}
			{editing && permission.admin && (
				<ColumnEditor
					board={board}
					column={column}
					onClose={() => setEditing(false)}
				/>
			)}
		</section>
	);
}
function TaskTile({
	task,
	disabled,
	onOpen,
}: {
	task: Task;
	disabled: boolean;
	onOpen: () => void;
}) {
	const drag = useDraggable({ id: task.id, data: { task }, disabled });
	const drop = useDroppable({
		id: `before-${task.id}`,
		data: { columnId: task.columnId, beforeTaskId: task.id },
		disabled,
	});
	return (
		<article
			ref={(node) => {
				drag.ref(node);
				drop.ref(node);
			}}
			className={`kanban-task ${drag.isDragging ? "dragging" : ""}`}
		>
			<div className="task-top">
				<span className={`priority priority-${task.priority.toLowerCase()}`}>
					{task.priority}
				</span>
				<button
					type="button"
					disabled={disabled}
					ref={drag.handleRef}
					className="drag-handle"
					aria-label={`Drag ${task.title}`}
				>
					<GripVertical size={16} />
				</button>
			</div>
			<button type="button" className="task-title" onClick={onOpen}>
				{task.column.isCompleted ? "✓ " : ""}
				{task.title}
			</button>
			{task.description && <p>{task.description}</p>}
			<div className="task-card-footer">
				{task.dueDate && (
					<span>
						<CalendarDays size={12} />
						{new Date(task.dueDate).toLocaleDateString(undefined, {
							month: "short",
							day: "numeric",
						})}
					</span>
				)}
				{task._count.subtasks > 0 && (
					<span>{task._count.subtasks} subtasks</span>
				)}
				{task.parentTaskId && <span>Subtask</span>}
				<span>{task.assignee?.name || "Unassigned"}</span>
			</div>
		</article>
	);
}
function ColumnEditor({
	board,
	column,
	onClose,
}: {
	board: BoardDetail;
	column?: Column;
	onClose: () => void;
}) {
	const write = useWrite();
	const [deleting, setDeleting] = useState(false);
	const [base, setBase] = useState(column);
	return (
		<Modal
			title={column ? "Shape this column" : "Add a column"}
			onClose={onClose}
		>
			{column && base && column.version !== base.version && (
				<div className="notice">
					<p>This column changed. Your draft is preserved.</p>
					<Button type="button" onClick={() => setBase(column)}>
						Load latest and discard draft
					</Button>
				</div>
			)}
			<form
				key={base?.version || "new"}
				onSubmit={async (e) => {
					e.preventDefault();
					if (write.isPending) return;
					const d = new FormData(e.currentTarget);
					try {
						await write.mutateAsync({
							path: `/boards/${board.board.id}/columns${column ? `/${column.id}` : ""}`,
							method: column ? "PATCH" : "POST",
							body: {
								title: String(d.get("title")).trim(),
								isCompleted: d.get("completed") === "on",
								...(column ? { version: base?.version } : {}),
							},
						});
						onClose();
					} catch {}
				}}
			>
				<label className="field">
					Column name
					<input
						name="title"
						required
						maxLength={80}
						defaultValue={base?.title}
					/>
				</label>
				<label className="check-label">
					<input
						type="checkbox"
						name="completed"
						defaultChecked={base?.isCompleted}
					/>
					Tasks in this column are completed
				</label>
				<Button disabled={write.isPending}>Save column</Button>
			</form>
			{column && (
				<Button className="button-secondary" onClick={() => setDeleting(true)}>
					Delete column
				</Button>
			)}
			{write.error && <ErrorNotice error={write.error} />}{" "}
			{deleting && column && (
				<form
					className="drawer-section"
					onSubmit={async (e) => {
						e.preventDefault();
						const d = new FormData(e.currentTarget);
						try {
							await write.mutateAsync({
								path: `/boards/${board.board.id}/columns/${column.id}`,
								method: "DELETE",
								body: {
									version: base?.version,
									...(d.get("destination")
										? { destinationColumnId: d.get("destination") }
										: {}),
								},
							});
							onClose();
						} catch {}
					}}
				>
					<p>
						Tasks must be moved to another column before this column is removed.
					</p>
					<label className="field">
						Move tasks to
						<select name="destination" required={column.taskCount > 0}>
							<option value="">Choose destination</option>
							{board.columns
								.filter((c) => c.id !== column.id)
								.map((c) => (
									<option key={c.id} value={c.id}>
										{c.title}
									</option>
								))}
						</select>
					</label>
					<Button disabled={write.isPending}>Confirm delete column</Button>
				</form>
			)}
		</Modal>
	);
}
function BoardSettings({ board }: { board: BoardDetail }) {
	const write = useWrite();
	const permission = permissions(board.board);
	const [confirm, setConfirm] = useState(false);
	const [base, setBase] = useState(board.board);
	return (
		<>
			<form
				key={base.version}
				onSubmit={async (e: FormEvent<HTMLFormElement>) => {
					e.preventDefault();
					const d = new FormData(e.currentTarget);
					try {
						await write.mutateAsync({
							path: `/boards/${board.board.id}`,
							body: {
								title: String(d.get("title")).trim(),
								description: String(d.get("description")) || null,
								color: d.get("color"),
								version: base.version,
							},
						});
					} catch {}
				}}
			>
				{base.version !== board.board.version && (
					<div className="notice">
						<p>
							This board changed. Your draft is preserved; reload before saving.
						</p>
						<Button
							type="button"
							className="button-secondary"
							onClick={() => setBase(board.board)}
						>
							Load latest and discard draft
						</Button>
					</div>
				)}
				<fieldset disabled={!permission.admin || write.isPending}>
					<label className="field">
						Board name
						<input
							name="title"
							required
							maxLength={120}
							defaultValue={base.title}
						/>
					</label>
					<label className="field">
						Description
						<textarea
							name="description"
							maxLength={2000}
							defaultValue={base.description || ""}
						/>
					</label>
					<label className="field">
						Color
						<input type="color" name="color" defaultValue={base.color} />
					</label>
					<Button>Save changes</Button>
				</fieldset>
			</form>
			{permission.owner && (
				<div className="drawer-section">
					<Button className="button-secondary" onClick={() => setConfirm(true)}>
						{board.board.archivedAt ? "Restore board" : "Archive board"}
					</Button>
				</div>
			)}
			{write.isSuccess && <p role="status">Board updated.</p>}
			{write.error && <ErrorNotice error={write.error} />}{" "}
			{confirm && (
				<Modal
					title={
						board.board.archivedAt
							? "Restore this board?"
							: "Archive this board?"
					}
					description="Archived boards remain readable. The owner can restore them."
					onClose={() => setConfirm(false)}
				>
					<Button
						disabled={write.isPending}
						onClick={async () => {
							try {
								await write.mutateAsync({
									path: `/boards/${board.board.id}/${board.board.archivedAt ? "restore" : "archive"}`,
									body: { version: board.board.version },
								});
								setConfirm(false);
							} catch {}
						}}
					>
						Confirm
					</Button>
					{write.error && <ErrorNotice error={write.error} />}
				</Modal>
			)}
		</>
	);
}
