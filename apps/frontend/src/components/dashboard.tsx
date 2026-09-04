import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
	type Board,
	type BoardListItem,
	type CreateBoard,
	createApiClient,
	validateBoard,
} from "../lib/api";
import { useBoards, useMe, useRefresh } from "../lib/workspace";
import { useIdentity } from "./providers";
import { Button, ErrorNotice, Loading } from "./ui";
import { AppShell } from "./workspace/app-shell";
export function CreateBoardForm({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: (board: Board) => void;
}) {
	const { getToken } = useIdentity();
	const api = createApiClient(getToken);
	const busy = useRef(false);
	const titleInput = useRef<HTMLInputElement>(null);
	useEffect(() => {
		titleInput.current?.focus();
	}, []);
	const [validation, setValidation] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: (input: CreateBoard) => api<Board>("/boards", { body: input }),
		onSuccess: (board) => onCreated(board),
	});
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (busy.current) return;
		const data = new FormData(event.currentTarget);
		const input = {
			title: String(data.get("title") || "").trim(),
			description: String(data.get("description") || "").trim() || null,
			color: String(data.get("color") || "#bf4f2b"),
		};
		const error = validateBoard(input);
		setValidation(error);
		if (error) return;
		busy.current = true;
		try {
			await mutation.mutateAsync(input);
		} catch {
			/* The mutation error is rendered below. */
		} finally {
			busy.current = false;
		}
	}
	return (
		<section className="create-board-panel" aria-labelledby="create-title">
			<div className="panel-heading">
				<div>
					<span className="eyebrow">A PLACE TO BEGIN</span>
					<h2 id="create-title">What are you working on?</h2>
				</div>
				<Button
					className="icon-button button-secondary"
					aria-label="Close create board"
					onClick={onClose}
					disabled={mutation.isPending}
				>
					<X size={20} />
				</Button>
			</div>
			<form onSubmit={submit}>
				<fieldset disabled={mutation.isPending}>
					<div className="form-row">
						<label className="field grow" htmlFor="board-title">
							Board name
							<input
								id="board-title"
								ref={titleInput}
								name="title"
								placeholder="e.g. Our next big idea"
								required
								maxLength={120}
							/>
						</label>
						<label className="field" htmlFor="board-color">
							Color
							<input
								id="board-color"
								name="color"
								type="color"
								defaultValue="#bf4f2b"
							/>
						</label>
					</div>
					<label className="field" htmlFor="board-description">
						A little context <span>(optional)</span>
						<textarea
							id="board-description"
							name="description"
							placeholder="What would you like to make happen?"
							maxLength={2000}
							rows={3}
						/>
					</label>
					{validation && (
						<p role="alert" className="field-error">
							{validation}
						</p>
					)}
					{mutation.error && <ErrorNotice error={mutation.error} />}
					<div className="form-actions">
						<p>You can shape the details as you go.</p>
						<Button type="submit">
							{mutation.isPending ? "Creating…" : "Create board"}
							<ArrowUpRight size={17} />
						</Button>
					</div>
				</fieldset>
			</form>
		</section>
	);
}
export function BoardCard({ board }: { board: BoardListItem }) {
	return (
		<article
			className="workspace-board"
			style={{ borderTopColor: board.color }}
		>
			<span className="role-badge">{board.role.toLowerCase()}</span>
			<h3>{board.title}</h3>
			<p className="board-description">
				{board.description || "A little space for your next good idea."}
			</p>
			<div className="board-stats">
				<span>{board.taskCount} tasks</span>
				<span>{board.memberCount} members</span>
			</div>
			<Link
				className="board-expand"
				to="/board/$boardId"
				params={{ boardId: board.id }}
			>
				Open board <ArrowUpRight size={17} />
			</Link>
		</article>
	);
}
export function Dashboard() {
	return (
		<AppShell>
			<DashboardContent />
		</AppShell>
	);
}
function DashboardContent() {
	const user = useMe();
	const boards = useBoards();
	const [creating, setCreating] = useState(false);
	const [search, setSearch] = useState("");
	const [archived, setArchived] = useState(false);
	const refresh = useRefresh();
	return (
		<>
			<div className="workspace-page-heading">
				<div>
					<span className="eyebrow">YOUR CORNER OF POSSIBILITY</span>
					<h1>
						Hello, {user.data?.name?.split(" ")[0] || "there"}.<br />
						<span className="muted-serif">What’s next?</span>
					</h1>
					<p>A little clarity for everything you’re working toward.</p>
				</div>
				<Button onClick={() => setCreating(true)} disabled={creating}>
					<Plus size={18} />
					New board
				</Button>
			</div>
			{creating && (
				<CreateBoardForm
					onClose={() => setCreating(false)}
					onCreated={() => {
						setCreating(false);
						void refresh();
					}}
				/>
			)}
			<div className="filter-bar">
				<input
					aria-label="Search boards"
					placeholder="Find a board…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<Button
					className={!archived ? "" : "button-secondary"}
					aria-pressed={!archived}
					onClick={() => setArchived(false)}
				>
					Active boards
				</Button>
				<Button
					className={archived ? "" : "button-secondary"}
					aria-pressed={archived}
					onClick={() => setArchived(true)}
				>
					Archived boards
				</Button>
			</div>
			{boards.isPending && <Loading />}
			{boards.error && (
				<ErrorNotice error={boards.error} retry={() => void boards.refetch()} />
			)}
			<div className="boards-grid">
				{boards.data
					?.filter(
						(b) =>
							!!b.archivedAt === archived &&
							b.title.toLowerCase().includes(search.toLowerCase()),
					)
					.map((b) => (
						<BoardCard key={b.id} board={b} />
					))}
			</div>
			{boards.isSuccess &&
				!boards.data.some(
					(b) =>
						!!b.archivedAt === archived &&
						b.title.toLowerCase().includes(search.toLowerCase()),
				) && (
					<div className="empty-state">
						<h3>
							{archived
								? "No archived boards here."
								: "Good things start with a blank board."}
						</h3>
						<p>
							{search
								? "Try a different search."
								: "Give your next idea a place to grow."}
						</p>
					</div>
				)}
		</>
	);
}
