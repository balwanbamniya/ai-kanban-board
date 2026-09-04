import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, MoveRight } from "lucide-react";
import { useIdentity } from "./providers";
import { SiteHeader } from "./site-header";
import { Footer } from "./ui";
export function NotFoundPage() {
	const { userId } = useIdentity();
	return (
		<>
			<SiteHeader />
			<main id="main-content" className="not-found page-container">
				<div className="lost-board" aria-hidden="true">
					<div className="lost-column">
						<span>TO DO</span>
						<div>
							Find the right page <MoveRight size={18} />
						</div>
					</div>
					<div className="lost-column">
						<span>NOT FOUND</span>
						<strong>
							404<span>✳</span>
						</strong>
					</div>
					<div className="lost-column">
						<span>UP NEXT</span>
						<div>
							A fresh direction <ArrowUpRight size={18} />
						</div>
					</div>
				</div>
				<span className="eyebrow">A SMALL DETOUR</span>
				<h1>
					This one slipped
					<br />
					off the board.
				</h1>
				<p>
					The page you’re looking for may have moved,
					<br />
					or it might still be an idea waiting to happen.
				</p>
				<div className="hero-actions">
					<Link to="/" className="button">
						<ArrowLeft size={17} />
						Back to home
					</Link>
					{userId && (
						<Link to="/dashboard" className="text-link">
							Your workspace <ArrowUpRight size={17} />
						</Link>
					)}
				</div>
			</main>
			<Footer />
		</>
	);
}
