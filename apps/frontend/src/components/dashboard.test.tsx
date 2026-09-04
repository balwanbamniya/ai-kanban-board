import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "../test/render";
import { BoardCard, CreateBoardForm, Dashboard } from "./dashboard";

const identity = vi.hoisted(() => ({
	userId: "user-1" as string | null,
	isLoaded: true,
	getToken: async () => "token",
}));
vi.mock("./providers", () => ({ useIdentity: () => identity }));
vi.mock("@clerk/tanstack-react-start", () => ({
	UserButton: () => <button type="button">Account</button>,
}));
const board = {
	id: "board-1",
	title: "A real project",
	description: "Our shared plan",
	color: "#bf4f2b",
	role: "OWNER" as const,
	ownerId: "user-1",
	version: 1,
	archivedAt: null,
	createdAt: "2026-09-04T00:00:00Z",
	updatedAt: "2026-09-04T00:00:00Z",
	memberCount: 2,
	taskCount: 3,
};
const json = (value: unknown) =>
	new Response(JSON.stringify(value), { status: 200 });
beforeEach(() => {
	identity.userId = "user-1";
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
describe("workspace", () => {
	it("synchronizes the user before fetching boards and supports pagination", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(json({ id: "user-1", name: "Alex Example" }))
			.mockResolvedValueOnce(json({ boards: [board], nextCursor: "next-id" }))
			.mockResolvedValueOnce(
				json({
					boards: [{ ...board, id: "board-2", title: "Next project" }],
					nextCursor: null,
				}),
			);
		vi.stubGlobal("fetch", fetcher);
		renderPage(<Dashboard />);
		expect(await screen.findByText("A real project")).toBeInTheDocument();
		expect(fetcher.mock.calls[0]?.[0]).toContain("/users/me");
		expect(fetcher.mock.calls[1]?.[0]).toContain("/boards?limit=12");
		fireEvent.click(screen.getByRole("button", { name: /More possibilities/ }));
		expect(await screen.findByText("Next project")).toBeInTheDocument();
		expect(fetcher.mock.calls[2]?.[0]).toContain("cursor=next-id");
		expect(
			screen.queryByRole("button", { name: /More possibilities/ }),
		).not.toBeInTheDocument();
	});
	it("shows an empty state", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce(json({ name: "Alex" }))
				.mockResolvedValueOnce(json({ boards: [], nextCursor: null })),
		);
		renderPage(<Dashboard />);
		expect(
			await screen.findByText("Good things start with a blank board."),
		).toBeInTheDocument();
	});
	it("recovers after a user-sync network failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockRejectedValueOnce(new TypeError("offline"))
				.mockResolvedValueOnce(json({ name: "Alex" }))
				.mockResolvedValueOnce(json({ boards: [], nextCursor: null })),
		);
		renderPage(<Dashboard />);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"couldn’t reach",
		);
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(
			await screen.findByText("Good things start with a blank board."),
		).toBeInTheDocument();
	});
	it("does not request private data when signed out", async () => {
		identity.userId = null;
		const fetcher = vi.fn();
		vi.stubGlobal("fetch", fetcher);
		renderPage(<Dashboard />);
		expect(
			await screen.findByRole("heading", {
				name: "Your workspace is waiting.",
			}),
		).toBeInTheDocument();
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("loads a board overview only when expanded", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			json({
				board,
				columns: [{ id: "c1", title: "To do" }],
				members: [{ id: "m1" }],
			}),
		);
		vi.stubGlobal("fetch", fetcher);
		renderPage(<BoardCard board={board} />);
		const expand = await screen.findByRole("button", {
			name: "Board overview",
		});
		expect(fetcher).not.toHaveBeenCalled();
		fireEvent.click(expand);
		expect(await screen.findByText("To do")).toBeInTheDocument();
		expect(expand).toHaveAttribute("aria-expanded", "true");
	});
	it("validates, trims, and prevents concurrent board creation", async () => {
		let resolve!: (response: Response) => void;
		const fetcher = vi.fn().mockImplementation(
			() =>
				new Promise<Response>((done) => {
					resolve = done;
				}),
		);
		vi.stubGlobal("fetch", fetcher);
		const onCreated = vi.fn();
		renderPage(<CreateBoardForm onCreated={onCreated} onClose={() => {}} />);
		const name = await screen.findByLabelText("Board name");
		fireEvent.change(name, { target: { value: "   " } });
		fireEvent.submit(name.closest("form") as HTMLFormElement);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"between 1 and 120",
		);
		expect(fetcher).not.toHaveBeenCalled();
		fireEvent.change(name, { target: { value: "  Our plan  " } });
		fireEvent.submit(name.closest("form") as HTMLFormElement);
		fireEvent.submit(name.closest("form") as HTMLFormElement);
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
		expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({
			title: "Our plan",
			description: null,
			color: "#bf4f2b",
		});
		resolve(json(board));
		await waitFor(() => expect(onCreated).toHaveBeenCalledWith(board));
	});
});
