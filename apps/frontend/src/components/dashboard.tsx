import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowUpRight,
	ChevronDown,
	LayoutGrid,
	Plus,
	Users,
	X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
	type Board,
	type BoardDetail,
	type BoardListItem,
	type BoardPage,
	type CreateBoard,
	type CurrentUser,
	createApiClient,
	validateBoard,
} from "../lib/api";
import { useIdentity } from "./providers";
import { SiteHeader } from "./site-header";
import { Button, ErrorNotice, Footer, Loading } from "./ui";
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
	const { getToken, userId } = useIdentity();
	const [expanded, setExpanded] = useState(false);
	const detail = useQuery({
		queryKey: ["board", userId, board.id],
		queryFn: ({ signal }) =>
			createApiClient(getToken)<BoardDetail>(
				`/boards/${encodeURIComponent(board.id)}`,
				{ signal },
			),
		enabled: expanded,
	});
	return (
		<article
			className="workspace-board"
			style={{ borderTopColor: board.color }}
		>
			<div className="workspace-board-top">
				<span className="board-symbol" style={{ color: board.color }}>
					<LayoutGrid size={23} />
				</span>
				<span className="role-badge">{board.role.toLowerCase()}</span>
			</div>
			<h3>{board.title}</h3>
			<p className="board-description">
				{board.description || "A little space for your next good idea."}
			</p>
			<div className="board-stats">
				<span>
					<LayoutGrid size={14} />
					{board.taskCount} {board.taskCount === 1 ? "task" : "tasks"}
				</span>
				<span>
					<Users size={14} />
					{board.memberCount} {board.memberCount === 1 ? "member" : "members"}
				</span>
			</div>
			<button
				type="button"
				className="board-expand"
				aria-expanded={expanded}
				aria-controls={`detail-${board.id}`}
				onClick={() => setExpanded(!expanded)}
			>
				{expanded ? "Close overview" : "Board overview"}
				<ChevronDown size={17} className={expanded ? "rotate-180" : ""} />
			</button>
			{expanded && (
				<div id={`detail-${board.id}`} className="board-detail">
					{detail.isPending ? (
						<Loading>Loading overview…</Loading>
					) : detail.error ? (
						<ErrorNotice
							error={detail.error}
							retry={() => void detail.refetch()}
						/>
					) : (
						<>
							<h4>YOUR COLUMNS</h4>
							<ul>
								{detail.data.columns.map((column) => (
									<li key={column.id}>
										<span className="status-dot" />
										{column.title}
									</li>
								))}
							</ul>
							<p>
								{detail.data.members.length}{" "}
								{detail.data.members.length === 1
									? "person has"
									: "people have"}{" "}
								a place on this board.
							</p>
							<p className="detail-note">
								This is your board overview. Task editing is coming in the next
								release.
							</p>
						</>
					)}
				</div>
			)}
		</article>
	);
}
export function Dashboard() {
	const { isLoaded, userId, getToken } = useIdentity();
	if (!isLoaded) return <Loading />;
	if (!userId)
		return (
			<>
				<SiteHeader />
				<main id="main-content" className="page-container session-ended">
					<h1>Your workspace is waiting.</h1>
					<p>Sign in to pick up where you left off.</p>
					<Link
						to="/login"
						search={{ redirect: "/dashboard" }}
						className="button"
					>
						Sign in <ArrowUpRight size={17} />
					</Link>
				</main>
			</>
		);
	return <Workspace key={userId} userId={userId} getToken={getToken} />;
}
function Workspace({
	userId,
	getToken,
}: {
	userId: string;
	getToken: () => Promise<string | null>;
}) {
	const client = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [notice, setNotice] = useState("");
	const createButton = useRef<HTMLButtonElement>(null);
	const api = createApiClient(getToken);
	const user = useQuery({
		queryKey: ["user", userId],
		queryFn: ({ signal }) => api<CurrentUser>("/users/me", { signal }),
	});
	const boards = useInfiniteQuery({
		queryKey: ["boards", userId],
		initialPageParam: null as string | null,
		queryFn: ({ pageParam, signal }) =>
			api<BoardPage>(
				`/boards?limit=12${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
				{ signal },
			),
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: user.isSuccess,
	});
	function closeForm() {
		setCreating(false);
		createButton.current?.focus();
	}
	async function created(board: Board) {
		setNotice(`“${board.title}” is ready. A little space for something good.`);
		closeForm();
		await client.invalidateQueries({ queryKey: ["boards", userId] });
	}
	const items = boards.data?.pages.flatMap((page) => page.boards) || [];
	return (
		<>
			<SiteHeader workspace />
			<main id="main-content" className="workspace page-container">
				<div className="workspace-heading">
					<div>
						<span className="eyebrow">YOUR CORNER OF POSSIBILITY</span>
						<h1>
							{user.data
								? `Hello, ${user.data.name.split(" ")[0] || "there"}.`
								: "Your workspace."}
							<br />
							<span className="muted-serif">What’s next?</span>
						</h1>
						<p>A little clarity for everything you’re working toward.</p>
					</div>
					<Button
						ref={createButton}
						onClick={() => {
							setCreating(true);
							setNotice("");
						}}
						disabled={!user.isSuccess || creating}
					>
						<Plus size={18} />
						New board
					</Button>
				</div>
				<div role="status" className={notice ? "success-notice" : "sr-only"}>
					{notice}
				</div>
				{creating && (
					<CreateBoardForm onClose={closeForm} onCreated={created} />
				)}
				<section aria-labelledby="boards-heading">
					<div className="boards-heading">
						<h2 id="boards-heading">Your boards</h2>
						<span>THE BIG PICTURE</span>
					</div>
					{user.isPending ? (
						<Loading>Finding your workspace…</Loading>
					) : user.error ? (
						<ErrorNotice error={user.error} retry={() => void user.refetch()} />
					) : (
						<>
							{boards.isPending && <Loading>Gathering your boards…</Loading>}
							{boards.error && (
								<ErrorNotice
									error={boards.error}
									retry={() => void boards.refetch()}
								/>
							)}{" "}
							{boards.isSuccess && items.length === 0 && (
								<div className="empty-state">
									<span className="empty-icon">
										<LayoutGrid size={34} strokeWidth={1.2} />
									</span>
									<h3>Good things start with a blank board.</h3>
									<p>
										Give that project you’ve been thinking about
										<br />a little room to take shape.
									</p>
									<Button
										className="button-secondary"
										onClick={() => setCreating(true)}
										disabled={creating}
									>
										<Plus size={17} />
										Create your first board
									</Button>
								</div>
							)}
							<div className="boards-grid">
								{items.map((board) => (
									<BoardCard key={board.id} board={board} />
								))}
							</div>
							{boards.hasNextPage && (
								<div className="load-more">
									<Button
										className="button-secondary"
										disabled={boards.isFetchingNextPage}
										onClick={() => void boards.fetchNextPage()}
									>
										{boards.isFetchingNextPage
											? "Loading…"
											: "More possibilities"}
										<ArrowDown size={16} />
									</Button>
								</div>
							)}
						</>
					)}
				</section>
			</main>
			<Footer />
		</>
	);
}
