import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { AiRun, BoardDetail } from "../../lib/api";
import { permissions, useApi, usePages, useWrite } from "../../lib/workspace";
import { Button, ErrorNotice, Loading } from "../ui";
import { More } from "./primitives";
export function ActivityPanel({ boardId }: { boardId: string }) {
	const feed = usePages<{
		activities: {
			id: string;
			actor: { name: string } | null;
			message: string;
			createdAt: string;
			payload: Record<string, unknown>;
		}[];
	}>("activity", `/boards/${boardId}/activity`);
	return (
		<>
			{feed.isPending && <Loading />}
			{feed.error && <ErrorNotice error={feed.error} />}
			<ol className="activity-list">
				{feed.data?.pages
					.flatMap((p) => p.activities)
					.map((item) => (
						<li key={item.id}>
							<span className="activity-dot" />
							<div>
								<strong>{item.actor?.name || "System"}</strong>
								<p>
									{item.message}
									{typeof item.payload?.title === "string"
										? `: ${item.payload.title}`
										: ""}
								</p>
								<time dateTime={item.createdAt}>
									{new Date(item.createdAt).toLocaleString()}
								</time>
							</div>
						</li>
					))}
			</ol>
			{feed.isSuccess && !feed.data.pages[0]?.activities.length && (
				<p className="notice">Your board’s story starts here.</p>
			)}
			<More query={feed} />
		</>
	);
}
export function AiPanel({ board }: { board: BoardDetail }) {
	const history = usePages<{ runs: AiRun[] }>(
		"ai",
		`/boards/${board.board.id}/ai/runs`,
		true,
		5000,
	);
	const [selected, setSelected] = useState("");
	const api = useApi();
	const run = useQuery({
		queryKey: ["ai", board.board.id, selected],
		queryFn: ({ signal }) =>
			api<AiRun>(`/boards/${board.board.id}/ai/runs/${selected}`, { signal }),
		enabled: !!selected,
		refetchInterval: (q) =>
			["QUEUED", "RUNNING"].includes(q.state.data?.status || "") ? 2500 : false,
	});
	const create = useWrite<AiRun>();
	const [kind, setKind] = useState("task-generation");
	const [instructions, setInstructions] = useState("");
	const [count, setCount] = useState(5);
	const key = useRef({ fingerprint: "", id: "" });
	const permission = permissions(board.board);
	return (
		<>
			<p className="form-note">
				A starting point, not a final decision. Review suggestions before adding
				them. Summaries use a bounded snapshot of recent board work.
			</p>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					if (create.isPending) return;
					const input =
						kind === "task-generation"
							? { instructions: instructions.trim(), count }
							: {
									...(instructions.trim()
										? { instructions: instructions.trim() }
										: {}),
								};
					const fingerprint = JSON.stringify({ kind, input });
					if (key.current.fingerprint !== fingerprint)
						key.current = { fingerprint, id: crypto.randomUUID() };
					try {
						const created = await create.mutateAsync({
							path: `/boards/${board.board.id}/ai/${kind}-runs`,
							method: "POST",
							body: { input, idempotencyKey: key.current.id },
						});
						setSelected(created.id);
						key.current = { fingerprint: "", id: "" };
					} catch {}
				}}
			>
				<fieldset disabled={!permission.ai || create.isPending}>
					<label className="field">
						What would help?
						<select value={kind} onChange={(e) => setKind(e.target.value)}>
							<option value="task-generation">Suggest tasks</option>
							<option value="summary">Summarize this board</option>
						</select>
					</label>
					<label className="field">
						{kind === "summary"
							? "Additional instructions (optional)"
							: "What are you trying to accomplish?"}
						<textarea
							required={kind !== "summary"}
							maxLength={5000}
							value={instructions}
							onChange={(e) => setInstructions(e.target.value)}
							rows={3}
						/>
					</label>
					{kind === "task-generation" && (
						<label className="field">
							Number of suggestions
							<input
								type="number"
								min={1}
								max={20}
								value={count}
								onChange={(e) => setCount(Number(e.target.value))}
							/>
						</label>
					)}
					<Button>
						{create.isPending ? "Requesting…" : "Find some inspiration"}
					</Button>
				</fieldset>
			</form>
			{create.error && <ErrorNotice error={create.error} />}
			<div className="drawer-section">
				<h3>Previous runs</h3>
				{history.error && <ErrorNotice error={history.error} />}
				<ul className="plain-list">
					{history.data?.pages
						.flatMap((p) => p.runs)
						.map((r) => (
							<li key={r.id}>
								<button
									type="button"
									aria-pressed={selected === r.id}
									onClick={() => setSelected(r.id)}
								>
									{r.operationKind === "TASK_GENERATION"
										? "Task suggestions"
										: "Board summary"}
									<span>
										{r.status.toLowerCase()} ·{" "}
										{new Date(r.createdAt).toLocaleString()}
									</span>
								</button>
							</li>
						))}
				</ul>
				<More query={history} />
			</div>
			{selected &&
				(run.isPending ? (
					<Loading />
				) : run.error ? (
					<ErrorNotice error={run.error} />
				) : (
					run.data && (
						<RunResult key={run.data.id} run={run.data} board={board} />
					)
				))}
		</>
	);
}
function RunResult({ run, board }: { run: AiRun; board: BoardDetail }) {
	const [indexes, setIndexes] = useState<number[]>([]);
	const [columnId, setColumn] = useState(board.columns[0]?.id || "");
	const apply = useWrite();
	const key = useRef({ fingerprint: "", id: "" });
	if (run.status === "QUEUED" || run.status === "RUNNING")
		return (
			<Loading>
				{run.status === "QUEUED"
					? "Your request is queued…"
					: "Finding a fresh perspective…"}
			</Loading>
		);
	if (run.status === "FAILED")
		return (
			<div role="alert" className="error-notice">
				{run.errorMessage ||
					"This run could not be completed. You can submit a new request above."}
			</div>
		);
	const applied = new Set(run.suggestions.map((s) => s.suggestionIndex));
	const selected = indexes.filter((i) => !applied.has(i));
	return (
		<section className="ai-result">
			<h3>
				{run.operationKind === "TASK_GENERATION"
					? "Ideas worth considering"
					: "The bigger picture"}
			</h3>
			{run.output?.overview && (
				<p className="summary-overview">{run.output.overview}</p>
			)}
			{["blockers", "nextActions"].map((name) => {
				const items = run.output?.[name as "blockers" | "nextActions"];
				return (
					items && (
						<div key={name}>
							<h4>
								{name === "blockers" ? "Blockers" : "Suggested next actions"}
							</h4>
							<ul>
								{items.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</div>
					)
				);
			})}
			{run.output?.tasks?.map((task, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: Immutable suggestion indexes are persisted server identifiers.
				<label key={`${run.id}-${i}`} className="suggestion">
					<input
						type="checkbox"
						checked={selected.includes(i) || applied.has(i)}
						disabled={
							applied.has(i) || !permissions(board.board).ai || apply.isPending
						}
						onChange={(e) =>
							setIndexes((p) =>
								e.target.checked ? [...p, i] : p.filter((x) => x !== i),
							)
						}
					/>
					<span>
						<strong>{task.title}</strong>
						<p>{task.description}</p>
						<small>
							{task.priority}
							{applied.has(i) ? " · Already added" : ""}
						</small>
					</span>
				</label>
			))}
			{run.output?.tasks && (
				<>
					<label className="field">
						Add selected tasks to
						<select
							value={columnId}
							onChange={(e) => setColumn(e.target.value)}
						>
							{board.columns.map((c) => (
								<option value={c.id} key={c.id}>
									{c.title}
								</option>
							))}
						</select>
					</label>
					<Button
						disabled={
							!selected.length ||
							!columnId ||
							!permissions(board.board).ai ||
							apply.isPending
						}
						onClick={async () => {
							const fingerprint = JSON.stringify({
								columnId,
								selected: [...selected].sort((a, b) => a - b),
							});
							if (key.current.fingerprint !== fingerprint)
								key.current = { fingerprint, id: crypto.randomUUID() };
							try {
								await apply.mutateAsync({
									path: `/boards/${board.board.id}/ai/runs/${run.id}/apply`,
									method: "POST",
									body: {
										columnId,
										suggestionIndexes: selected,
										idempotencyKey: key.current.id,
									},
								});
								setIndexes([]);
							} catch {}
						}}
					>
						{apply.isPending
							? "Adding…"
							: `Add ${selected.length} selected tasks`}
					</Button>
				</>
			)}
			{apply.isSuccess && (
				<p role="status">Your selected tasks are on the board.</p>
			)}
			{apply.error && <ErrorNotice error={apply.error} />}
		</section>
	);
}
