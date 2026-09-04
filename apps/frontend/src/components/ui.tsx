import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { ApiError } from "../lib/api";
export function Brand() {
	return (
		<Link to="/" className="brand" aria-label="AI Kanban Board home">
			<span className="brand-mark" aria-hidden="true">
				<i />
				<i />
				<i />
			</span>
			<span>
				AI Kanban Board<span className="brand-period">.</span>
			</span>
		</Link>
	);
}
export function Button({
	className = "",
	children,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
	return (
		<button className={`button ${className}`} {...props}>
			{children}
		</button>
	);
}
export function Loading({
	children = "Loading your workspace…",
}: {
	children?: ReactNode;
}) {
	return (
		<div role="status" className="loading-state">
			<LoaderCircle size={20} className="spin" />
			{children}
		</div>
	);
}
export function ErrorNotice({
	error,
	retry,
}: {
	error: Error;
	retry?: () => void;
}) {
	return (
		<div role="alert" className="error-notice">
			<AlertCircle size={20} />
			<div>
				<p>{error.message}</p>
				{error instanceof ApiError && error.details.length > 0 && (
					<ul>
						{error.details.map((detail) => (
							<li key={detail}>{detail}</li>
						))}
					</ul>
				)}
				{error instanceof ApiError && error.requestId && (
					<p className="request-id">Reference: {error.requestId}</p>
				)}
				{error instanceof ApiError && error.status === 401 ? (
					<Link to="/login" className="text-link">
						Sign in again <ArrowRight size={14} />
					</Link>
				) : (
					retry && (
						<Button className="button-small button-secondary" onClick={retry}>
							Try again
						</Button>
					)
				)}
			</div>
		</div>
	);
}
export function Footer() {
	return (
		<footer className="site-footer page-container">
			<Brand />
			<p>A little structure. A lot of possibility.</p>
			<span>Made for moving forward.</span>
		</footer>
	);
}
