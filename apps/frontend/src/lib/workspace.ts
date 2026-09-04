import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useIdentity } from "../components/providers";
import {
	ApiError,
	type Board,
	type BoardDetail,
	type BoardPage,
	type CurrentUser,
	createApiClient,
} from "./api";
export function useApi() {
	const { getToken } = useIdentity();
	return createApiClient(getToken);
}
export function useMe() {
	const api = useApi();
	const { userId } = useIdentity();
	return useQuery({
		queryKey: ["user", userId],
		queryFn: ({ signal }) => api<CurrentUser>("/users/me", { signal }),
		enabled: !!userId,
	});
}
export function useBoards() {
	const api = useApi();
	const { userId } = useIdentity();
	return useQuery({
		queryKey: ["all-boards", userId],
		queryFn: async ({ signal }) => {
			let cursor: string | null = null;
			const boards: BoardPage["boards"] = [];
			do {
				const page: BoardPage = await api(
					`/boards?includeArchived=true&limit=100${cursor ? `&cursor=${cursor}` : ""}`,
					{ signal },
				);
				boards.push(...page.boards);
				cursor = page.nextCursor;
			} while (cursor);
			return boards;
		},
		enabled: !!userId,
		refetchInterval: 30_000,
	});
}
export function useBoard(id: string) {
	const api = useApi();
	const { userId } = useIdentity();
	const query = useQuery({
		queryKey: ["board", userId, id],
		queryFn: ({ signal }) => api<BoardDetail>(`/boards/${id}`, { signal }),
		enabled: !!id && !!userId,
		refetchInterval: 30_000,
	});
	const client = useQueryClient();
	useEffect(() => {
		if (!accessLost(query.error)) return;
		// Retain the failed query state for recovery while removing private payloads.
		const denied = client
			.getQueryCache()
			.find({ queryKey: ["board", userId, id], exact: true });
		if (denied?.state.data)
			denied.setState({ data: undefined, dataUpdatedAt: 0 });
		client.removeQueries({
			predicate: (q) =>
				q.queryKey[0] !== "board" &&
				q.queryKey.some(
					(part) =>
						typeof part === "string" &&
						(part === id || part.includes(`/boards/${id}/`)),
				),
		});
		void client.invalidateQueries({ queryKey: ["all-boards"] });
		void client.invalidateQueries({
			predicate: (q) =>
				q.queryKey[0] === "tasks" &&
				q.queryKey.some(
					(part) => typeof part === "string" && part.startsWith("/tasks?"),
				),
		});
	}, [query.error, client, id, userId]);
	return query;
}
export function usePages<T>(
	key: string,
	path: string,
	enabled = true,
	interval?: number,
) {
	const api = useApi();
	const { userId } = useIdentity();
	return useInfiniteQuery({
		queryKey: [key, userId, path],
		initialPageParam: null as string | null,
		queryFn: ({ pageParam, signal }) =>
			api<T & { nextCursor: string | null }>(
				`${path}${path.includes("?") ? "&" : "?"}limit=50${pageParam ? `&cursor=${pageParam}` : ""}`,
				{ signal },
			),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: enabled && !!userId,
		refetchInterval: interval,
	});
}
export const workspaceKeys = new Set([
	"board",
	"boards",
	"all-boards",
	"tasks",
	"task",
	"activity",
	"ai",
	"invitations",
]);
export function useRefresh() {
	const client = useQueryClient();
	return () =>
		client.invalidateQueries({
			predicate: (q) => workspaceKeys.has(String(q.queryKey[0])),
		});
}
export function useWrite<T = unknown>() {
	const api = useApi();
	const refresh = useRefresh();
	return useMutation({
		mutationFn: ({
			path,
			body,
			method = "PATCH",
		}: {
			path: string;
			body?: unknown;
			method?: "POST" | "PATCH" | "DELETE";
		}) => api<T>(path, { body, method }),
		onSuccess: () => refresh(),
		onError: () => refresh(),
	});
}
export function permissions(board: Board) {
	const active = !board.archivedAt;
	const admin = board.role === "OWNER" || board.role === "ADMIN";
	return {
		write: active && board.role !== "VIEWER",
		admin: active && admin,
		owner: board.role === "OWNER",
		ai: active && admin,
		readAi: active && admin,
		readInvitations: admin,
	};
}
export function params(values: Record<string, string | undefined>) {
	const query = new URLSearchParams();
	for (const [k, v] of Object.entries(values)) if (v) query.set(k, v);
	return query.toString();
}
export function localDateTime(value: string | null) {
	if (!value) return "";
	const date = new Date(value);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function accessLost(error: unknown) {
	return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
