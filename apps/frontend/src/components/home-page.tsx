export function HomePage() {
	return (
		<main className="min-h-screen bg-slate-950 px-6 py-20 text-slate-100">
			<div className="mx-auto max-w-4xl">
				<p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
					Project foundation
				</p>
				<h1 className="mt-4 text-5xl font-bold tracking-tight">
					AI Kanban Board
				</h1>
				<p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
					A type-safe workspace for building an intelligent task-planning
					experience with TanStack Start and NestJS.
				</p>
			</div>
		</main>
	);
}
