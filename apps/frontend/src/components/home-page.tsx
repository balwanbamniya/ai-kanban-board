import { Link } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowRight,
	ArrowUpRight,
	Check,
	Circle,
	Flag,
	LayoutGrid,
	MessageSquare,
	MoreHorizontal,
	Plus,
	Sparkles,
	Users,
} from "lucide-react";
import { useIdentity } from "./providers";
import { SiteHeader } from "./site-header";
import { Footer } from "./ui";

const sampleColumns = [
	{
		title: "To do",
		tone: "todo",
		tasks: [
			{
				tag: "STRATEGY",
				title: "Map the big picture",
				description: "Good things start with a clear direction.",
				priority: "High",
				initials: "JL",
				comments: 2,
			},
			{
				tag: "RESEARCH",
				title: "Listen to our people",
				description: "A few conversations. A fresh perspective.",
				priority: "Medium",
				initials: "AM",
				comments: 3,
			},
		],
	},
	{
		title: "In progress",
		tone: "progress",
		tasks: [
			{
				tag: "DESIGN",
				title: "Make room for good ideas",
				description: "Explore a warmer, more human direction.",
				priority: "High",
				initials: "SK",
				comments: 5,
			},
			{
				tag: "CONTENT",
				title: "Find the words that fit",
				description: "Less noise. More meaning.",
				priority: "Low",
				initials: "JL",
				comments: 1,
			},
		],
	},
	{
		title: "Done",
		tone: "done",
		tasks: [
			{
				tag: "PLANNING",
				title: "Bring the team together",
				description: "Different perspectives. One shared plan.",
				priority: "Medium",
				initials: "AM",
				comments: 4,
			},
		],
	},
];
export function BoardPreview() {
	return (
		<section
			className="board-preview"
			aria-label="Illustrative Kanban board with sample tasks"
		>
			<div className="preview-toolbar">
				<div>
					<span className="preview-board-icon">
						<LayoutGrid size={19} />
					</span>
					<strong>A fresh start</strong>
					<span className="preview-label">Sample board</span>
				</div>
				<div className="preview-people" aria-hidden="true">
					<span>JL</span>
					<span>AM</span>
					<span>SK</span>
				</div>
			</div>
			<div className="preview-columns">
				{sampleColumns.map((column) => (
					<section
						className={`preview-column ${column.tone}`}
						key={column.title}
					>
						<div className="column-heading">
							<span className="status-dot" />
							<h3>{column.title}</h3>
							<span>{column.tasks.length}</span>
							<Plus size={15} className="ml-auto" aria-hidden="true" />
						</div>
						{column.tasks.map((task) => (
							<article className="sample-task" key={task.title}>
								<div className="task-top">
									<span className="task-tag">{task.tag}</span>
									<MoreHorizontal size={17} aria-hidden="true" />
								</div>
								<h4>
									{column.tone === "done" && <Check size={15} />} {task.title}
								</h4>
								<p>{task.description}</p>
								<div className="task-bottom">
									<span
										className={`priority priority-${task.priority.toLowerCase()}`}
									>
										<Flag size={10} />
										{task.priority}
									</span>
									<span className="task-comments">
										<MessageSquare size={12} />
										{task.comments}
									</span>
									<span className="task-avatar">{task.initials}</span>
								</div>
							</article>
						))}
						{column.tone === "done" && (
							<div className="done-note">
								<span>
									<Check size={24} />
								</span>
								<p>
									Small wins.
									<br />
									Real momentum.
								</p>
							</div>
						)}
					</section>
				))}
			</div>
			<div className="preview-footer">
				<span>
					<Sparkles size={14} /> A little help turning ideas into next steps.
				</span>
				<span>Ideas → Action</span>
			</div>
		</section>
	);
}
export function HomePage() {
	const { userId } = useIdentity();
	const destination = userId ? "/dashboard" : "/register";
	return (
		<>
			<SiteHeader />
			<main id="main-content">
				<section className="hero page-container">
					<div className="hero-copy">
						<span className="eyebrow">
							<span className="tiny-star">✳</span> A CLEARER WAY TO WORK
						</span>
						<h1>
							Big ideas.
							<br />
							Clear next steps<span className="accent">.</span>
						</h1>
						<p>
							Your ideas deserve more than a scattered to-do list. Bring your
							tasks, your team, and a little AI inspiration into one thoughtful
							workspace.
						</p>
						<div className="hero-actions">
							<Link to={destination} className="button">
								{userId ? "Go to your workspace" : "Find your flow"}
								<ArrowUpRight size={18} />
							</Link>
							<a href="#how-it-works" className="text-link">
								See how it works <ArrowDown size={16} />
							</a>
						</div>
						<div className="hero-footnote">
							<span className="small-rule" />
							Less keeping track. More moving forward.
						</div>
					</div>
					<div className="hero-aside" aria-hidden="true">
						<div className="orbit-mark">✳</div>
						<span>
							ROOM TO THINK.
							<br />
							SPACE TO MAKE.
						</span>
						<svg viewBox="0 0 130 95" className="drawn-arrow">
							<title>Decorative arrow</title>
							<path d="M111 10 C34 -4 103 76 24 76 M24 76 L38 62 M24 76 L43 88" />
						</svg>
					</div>
				</section>
				<section
					className="preview-section page-container"
					aria-label="A look inside your workspace"
				>
					<div className="preview-caption">
						<span>YOUR NEXT CHAPTER, ORGANIZED.</span>
						<span>01 — THE WORKSPACE</span>
					</div>
					<BoardPreview />
				</section>
				<section id="features" className="features-section page-container">
					<div className="section-intro">
						<span className="eyebrow">THOUGHTFULLY SIMPLE</span>
						<h2>
							Everything in its place.
							<br />
							<span className="muted-serif">Everyone on the same page.</span>
						</h2>
						<p>
							A calmer way to turn the work you imagine into the work you
							finish.
						</p>
					</div>
					<div className="feature-grid">
						{[
							{
								icon: LayoutGrid,
								number: "01",
								title: "See the whole picture",
								text: "Give every task a home. Organize work into clear columns, set priorities, and make the next step easier to see.",
							},
							{
								icon: Users,
								number: "02",
								title: "Good work is a team sport",
								text: "Invite your people, give them the right access, and keep a shared record of how the work moves forward.",
							},
							{
								icon: Sparkles,
								number: "03",
								title: "A spark when you need it",
								text: "Turn a starting thought into AI task suggestions. Review the ideas, choose what fits, and make them your own.",
							},
						].map((feature) => (
							<article className="feature-card" key={feature.number}>
								<div className="feature-top">
									<feature.icon size={24} strokeWidth={1.5} />
									<span>{feature.number}</span>
								</div>
								<h3>{feature.title}</h3>
								<p>{feature.text}</p>
							</article>
						))}
					</div>
				</section>
				<section id="how-it-works" className="workflow-section">
					<div className="page-container workflow-layout">
						<div>
							<span className="eyebrow">FROM “WHAT IF” TO “WHAT’S NEXT”</span>
							<h2>
								Make a little space
								<br />
								for progress.
							</h2>
							<Link to={destination} className="text-link">
								Start something good <ArrowUpRight size={17} />
							</Link>
						</div>
						<ol className="workflow-steps">
							{[
								{
									title: "Start with a board",
									text: "A project, a plan, a possibility. Give it a name and a place to grow.",
								},
								{
									title: "Give your ideas direction",
									text: "Map out the work, invite collaborators, and explore AI suggestions.",
								},
								{
									title: "Move forward, together",
									text: "Find your priorities and turn the next small step into a meaningful win.",
								},
							].map((step, i) => (
								<li key={step.title}>
									<span className="step-number">0{i + 1}</span>
									<div>
										<h3>{step.title}</h3>
										<p>{step.text}</p>
									</div>
									<Circle size={10} aria-hidden="true" />
								</li>
							))}
						</ol>
					</div>
				</section>
				<section className="closing-section page-container">
					<span className="closing-star" aria-hidden="true">
						✳
					</span>
					<span className="eyebrow">YOUR NEXT GOOD IDEA STARTS HERE</span>
					<h2>
						Let’s make room
						<br />
						for what’s next.
					</h2>
					<Link to={destination} className="button">
						{userId ? "Open your workspace" : "Create your workspace"}
						<ArrowRight size={18} />
					</Link>
					<p>A little structure goes a long way.</p>
				</section>
			</main>
			<Footer />
		</>
	);
}
