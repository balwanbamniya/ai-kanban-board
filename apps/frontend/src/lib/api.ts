export interface CurrentUser {
	id: string;
	name: string;
	email: string;
	avatarUrl?: string;
	platformRole: string;
}
export interface Board {
	id: string;
	title: string;
	description: string | null;
	color: string;
	ownerId: string;
	role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
	version: number;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
}
export interface BoardListItem extends Board {
	memberCount: number;
	taskCount: number;
}
export interface BoardPage {
	boards: BoardListItem[];
	nextCursor: string | null;
}
export interface BoardDetail {
	board: BoardListItem;
	columns: {
		id: string;
		title: string;
		sortKey: string;
		version: number;
		createdAt: string;
		updatedAt: string;
	}[];
	members: {
		id: string;
		name: string;
		email: string | null;
		avatarUrl: string | null;
		role: Board["role"];
		joinedAt: string;
	}[];
}
export interface CreateBoard {
	title: string;
	description?: string | null;
	color: string;
}
export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public requestId?: string,
		public details: string[] = [],
	) {
		super(message);
		this.name = "ApiError";
	}
}
export function createApiClient(
	getToken: () => Promise<string | null>,
	baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api/v1",
) {
	return async function request<T>(
		path: string,
		options: { signal?: AbortSignal; body?: CreateBoard } = {},
	): Promise<T> {
		const token = await getToken();
		if (!token)
			throw new ApiError(
				"Your session has expired. Please sign in again.",
				401,
			);
		let response: Response;
		try {
			response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
				method: options.body ? "POST" : "GET",
				cache: "no-store",
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/json",
					...(options.body ? { "Content-Type": "application/json" } : {}),
				},
				body: options.body ? JSON.stringify(options.body) : undefined,
				signal: options.signal,
			});
		} catch (error) {
			if (options.signal?.aborted) throw error;
			throw new ApiError(
				"We couldn’t reach your workspace. Check your connection and try again.",
				0,
			);
		}
		if (!response.ok) {
			const problem: unknown = await response.json().catch(() => null);
			const p =
				problem && typeof problem === "object"
					? (problem as Record<string, unknown>)
					: {};
			const safeDetail =
				response.status < 500 &&
				response.headers
					.get("content-type")
					?.includes("application/problem+json") &&
				typeof p.detail === "string"
					? p.detail
					: "Something went wrong. Please try again.";
			throw new ApiError(
				response.status === 401
					? "Your session has expired. Please sign in again."
					: safeDetail,
				response.status,
				typeof p.requestId === "string"
					? p.requestId
					: response.headers.get("x-request-id") || undefined,
				response.status < 500 && Array.isArray(p.errors)
					? p.errors.filter((v): v is string => typeof v === "string")
					: [],
			);
		}
		if (response.status === 204) return undefined as T;
		return response.json() as Promise<T>;
	};
}
export function validateBoard(input: CreateBoard): string | null {
	if (!input.title.trim() || input.title.trim().length > 120)
		return "Give your board a name between 1 and 120 characters.";
	if ((input.description?.trim().length || 0) > 2000)
		return "Keep the description under 2,001 characters.";
	if (!/^#[0-9a-f]{6}$/i.test(input.color))
		return "Choose a valid board color.";
	return null;
}
