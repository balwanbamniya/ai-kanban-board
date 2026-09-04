import { UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import {
	CalendarDays,
	CheckCheck,
	LayoutGrid,
	Menu,
	Settings,
	Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { usePreferences } from "../../lib/preferences";
import { useMe } from "../../lib/workspace";
import { useIdentity } from "../providers";
import { Brand, Button, ErrorNotice, Loading } from "../ui";
import { Modal } from "./primitives";

const navigation = [
	{ to: "/dashboard", label: "Your boards", icon: LayoutGrid },
	{ to: "/my-tasks", label: "My tasks", icon: CheckCheck },
	{ to: "/calendar", label: "Calendar", icon: CalendarDays },
	{ to: "/team", label: "Team", icon: Users },
	{ to: "/settings", label: "Settings", icon: Settings },
] as const;
export function AppShell({ children }: { children: ReactNode }) {
	const { isLoaded, userId } = useIdentity();
	const me = useMe();
	const [open, setOpen] = useState(false);
	const { preferences } = usePreferences();

	return (
		<div className={`app-layout density-${preferences.density}`}>
			<aside className="app-sidebar">
				<Brand />
				<span className="eyebrow sidebar-label">A PLACE FOR POSSIBILITY</span>
				<nav aria-label="Workspace">
					{navigation.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							activeProps={{ className: "nav-active" }}
							onClick={() => setOpen(false)}
						>
							<item.icon size={19} />
							{item.label}
						</Link>
					))}
				</nav>
				<div className="sidebar-note">
					<span>✳</span>
					<p>
						Small steps.
						<br />
						Good things ahead.
					</p>
				</div>
				<Link to="/" className="text-link">
					Back to home ↗
				</Link>
			</aside>
			<div className="app-body">
				<header className="app-topbar">
					<Button
						className="mobile-menu icon-button button-secondary"
						aria-label="Open navigation"
						onClick={() => setOpen(true)}
					>
						<Menu size={20} />
					</Button>
					<span>YOUR WORK, WITH A LITTLE MORE CLARITY.</span>
					{userId && <UserButton />}
				</header>
				<main id="main-content" className="app-main">
					{!isLoaded || (me.isPending && userId) ? (
						<Loading />
					) : !userId ? (
						<div className="empty-state">
							<h1>Your workspace is waiting.</h1>
							<Link to="/login" className="button">
								Sign in
							</Link>
						</div>
					) : me.error ? (
						<ErrorNotice error={me.error} retry={() => void me.refetch()} />
					) : (
						children
					)}
				</main>
			</div>
			{open && (
				<Modal title="Your workspace" onClose={() => setOpen(false)}>
					<nav className="mobile-navigation" aria-label="Mobile workspace">
						{navigation.map((item) => (
							<Link key={item.to} to={item.to} onClick={() => setOpen(false)}>
								<item.icon size={20} />
								{item.label}
							</Link>
						))}
					</nav>
				</Modal>
			)}
		</div>
	);
}
