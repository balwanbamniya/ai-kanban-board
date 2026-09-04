import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRealtime } from "./realtime";

const mock = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => void>(),
	any: (_name: string, _event: unknown) => {},
	refresh: vi.fn(),
	connect: vi.fn(),
	disconnect: vi.fn(),
	emit: vi.fn(),
	removeAllListeners: vi.fn(),
	token: vi.fn(async () => "fresh-token"),
	options: {
		auth: async (_callback: (value: { token: string | null }) => void) => {},
	},
}));
vi.mock("../components/providers", () => ({
	useIdentity: () => ({ userId: "u1", getToken: mock.token }),
}));
vi.mock("./workspace", () => ({ useRefresh: () => mock.refresh }));
vi.mock("socket.io-client", () => ({
	io: (_url: string, options: typeof mock.options) => {
		mock.options = options;
		const socket = {
			on: (name: string, fn: (...args: unknown[]) => void) => {
				mock.handlers.set(name, fn);
			},
			onAny: (fn: typeof mock.any) => {
				mock.any = fn;
			},
			timeout: () => socket,
			emit: mock.emit,
			connect: mock.connect,
			disconnect: mock.disconnect,
			removeAllListeners: mock.removeAllListeners,
		};
		return socket;
	},
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mock.handlers.clear();
});
it("joins with fresh authentication, deduplicates events, and refreshes on reconnect", async () => {
	renderHook(() => useRealtime("b1", true));
	const auth = vi.fn();
	await mock.options.auth(auth);
	expect(auth).toHaveBeenCalledWith({ token: "fresh-token" });
	act(() => mock.handlers.get("connect")?.());
	expect(mock.emit.mock.calls[0]?.slice(0, 2)).toEqual([
		"board:join",
		{ boardId: "b1" },
	]);
	act(() => mock.emit.mock.calls[0]?.[2](null, { ok: true, presence: [] }));
	expect(mock.refresh).toHaveBeenCalledTimes(1);
	act(() => {
		mock.any("task.updated", { boardId: "b1", eventId: "e1" });
		mock.any("task.updated", { boardId: "b1", eventId: "e1" });
		mock.any("task.updated", { boardId: "other", eventId: "e2" });
	});
	expect(mock.refresh).toHaveBeenCalledTimes(2);
	act(() => {
		mock.handlers.get("disconnect")?.();
		mock.handlers.get("connect")?.();
	});
	act(() => mock.emit.mock.calls.at(-1)?.[2](null, { ok: true, presence: [] }));
	expect(mock.refresh).toHaveBeenCalledTimes(3);
});
it("removes presence and disconnects when permission is lost or the page closes", () => {
	const { result, rerender, unmount } = renderHook(
		({ enabled }) => useRealtime("b1", enabled),
		{ initialProps: { enabled: true } },
	);
	act(() =>
		mock.handlers.get("presence:joined")?.({ user: { id: "u2", name: "Pat" } }),
	);
	expect(result.current.people).toHaveLength(1);
	rerender({ enabled: false });
	expect(result.current.people).toHaveLength(0);
	expect(mock.removeAllListeners).toHaveBeenCalledOnce();
	expect(mock.disconnect).toHaveBeenCalledOnce();
	expect(mock.emit).toHaveBeenCalledWith("board:leave", { boardId: "b1" });
	unmount();
});
it("reports connection failure without suppressing REST recovery", () => {
	const { result } = renderHook(() => useRealtime("b1", true));
	act(() => mock.handlers.get("connect_error")?.());
	expect(result.current.status).toContain("Offline");
});
