import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
export function renderPage(element: ReactNode) {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: 30_000 },
			mutations: { retry: false },
		},
	});
	const route = createRootRoute({ component: () => element });
	const router = createRouter({
		routeTree: route,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	return {
		...render(
			<QueryClientProvider client={client}>
				<RouterProvider router={router} />
			</QueryClientProvider>,
		),
		client,
		router,
	};
}
