/**
 * Application-owned roles for a user's membership of a board.
 *
 * Values intentionally mirror the persisted Prisma enum, while keeping the
 * authorization domain independent from Prisma-generated types.
 */
export enum BoardRole {
	OWNER = "OWNER",
	ADMIN = "ADMIN",
	MEMBER = "MEMBER",
	VIEWER = "VIEWER",
}

export type BoardMembershipRole = Exclude<BoardRole, BoardRole.OWNER>;

export const boardMembershipRoles = [
	BoardRole.ADMIN,
	BoardRole.MEMBER,
	BoardRole.VIEWER,
] as const satisfies readonly BoardMembershipRole[];
