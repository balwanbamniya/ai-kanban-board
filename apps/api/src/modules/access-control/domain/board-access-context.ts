import type { BoardRole } from "./board-role.enum.js";

export interface BoardAccessContext {
	readonly boardId: string;
	readonly ownerId: string;
	readonly role: BoardRole;
	readonly userId: string;
}
