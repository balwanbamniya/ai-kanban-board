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
