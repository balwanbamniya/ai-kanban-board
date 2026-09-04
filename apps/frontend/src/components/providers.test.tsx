import { useQueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Providers } from "./providers";

const session = vi.hoisted(() => ({
	userId: "user-a" as string | null,
	sessionId: "session-a" as string | null,
	isLoaded: true,
	getToken: vi.fn().mockResolvedValue("token"),
}));
vi.mock("../lib/auth", () => ({ authConfigured: true }));
vi.mock("@clerk/tanstack-react-start", () => ({
	ClerkProvider: ({ children }: { children: ReactNode }) => children,
	useAuth: () => session,
}));
afterEach(cleanup);
it("clears old private queries and creates a separate cache on account change and logout", () => {
	const clients: ReturnType<typeof useQueryClient>[] = [];
	function Probe() {
		const client = useQueryClient();
		useEffect(() => {
			clients.push(client);
		}, [client]);
		return <span>{client.getQueryData<string>(["private"]) || "empty"}</span>;
	}
	const view = render(
		<Providers>
			<Probe />
		</Providers>,
	);
	const first = clients[0];
	first?.setQueryData(["private"], "Account A board");
	session.userId = "user-b";
	session.sessionId = "session-b";
	view.rerender(
		<Providers>
			<Probe />
		</Providers>,
	);
	expect(screen.getByText("empty")).toBeInTheDocument();
	expect(first?.getQueryData(["private"])).toBeUndefined();
	expect(clients[1]).not.toBe(first);
	const second = clients[1];
	second?.setQueryData(["private"], "Account B board");
	session.userId = null;
	session.sessionId = null;
	view.rerender(
		<Providers>
			<Probe />
		</Providers>,
	);
	expect(second?.getQueryData(["private"])).toBeUndefined();
	expect(screen.getByText("empty")).toBeInTheDocument();
});
