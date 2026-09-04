import { UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useIdentity } from "./providers";
import { Brand } from "./ui";
export function SiteHeader({ workspace = false }: { workspace?: boolean }) {
	const { userId, isLoaded } = useIdentity();
	return (
		<header className="site-header page-container">
			<Brand />
			{!workspace && (
				<nav className="desktop-nav" aria-label="Main navigation">
					<a href="/#features">The possibilities</a>
					<a href="/#how-it-works">How it works</a>
				</nav>
			)}
			<div className="header-actions">
				{userId ? (
					<>
						<Link
							to="/dashboard"
							className="button button-small button-secondary"
						>
							Your workspace <ArrowUpRight size={15} />
						</Link>
						<UserButton />
					</>
				) : (
					<>
						<Link to="/login" className="login-link">
							Log in
						</Link>
						<Link
							to="/register"
							className="button button-small"
							aria-disabled={!isLoaded}
						>
							Get started <ArrowUpRight size={15} />
						</Link>
					</>
				)}
			</div>
		</header>
	);
}
