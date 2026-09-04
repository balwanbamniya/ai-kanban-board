import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";
import { NotFoundPage } from "../components/not-found-page";
import { Providers } from "../components/providers";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				name: "description",
				content:
					"A thoughtful workspace for your tasks, your team, and your next good idea. Bring clarity to your projects with AI Kanban Board.",
			},
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "AI Kanban Board",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
	notFoundComponent: NotFoundPage,
	errorComponent: () => (
		<main id="main-content" className="page-container session-ended">
			<h1>This page needs a fresh start.</h1>
			<p>Something interrupted the page. Please try loading it again.</p>
			<a href="/" className="button">
				Back to home
			</a>
		</main>
	),
});

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<a href="#main-content" className="skip-link">
					Skip to content
				</a>
				<Providers>{children}</Providers>
				{import.meta.env.DEV && (
					<TanStackDevtools
						config={{
							position: "bottom-right",
						}}
						plugins={[
							{
								name: "TanStack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
						]}
					/>
				)}
				<Scripts />
			</body>
		</html>
	);
}
