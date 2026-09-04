import { requestStorage } from "../../../common/request-context/request-context.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";

export const BoardEventName = {
	ARCHIVED: "board.archived",
	CREATED: "board.created",
	INVITATION_ACCEPTED: "board.invitation.accepted",
	INVITATION_CANCELLED: "board.invitation.cancelled",
	INVITATION_CREATED: "board.invitation.created",
	INVITATION_EXPIRED: "board.invitation.expired",
	INVITATION_RESENT: "board.invitation.resent",
	MEMBER_LEFT: "board.member.left",
	MEMBER_REMOVED: "board.member.removed",
	MEMBER_ROLE_UPDATED: "board.member.role_updated",
	OWNERSHIP_TRANSFERRED: "board.ownership.transferred",
	RESTORED: "board.restored",
	UPDATED: "board.updated",
} as const;

export type BoardEventName =
	(typeof BoardEventName)[keyof typeof BoardEventName];

interface RecordBoardEventInput {
	actorId: string;
	boardId: string;
	eventName: BoardEventName;
	message: string;
	payload: Prisma.InputJsonObject;
}

export async function recordBoardEvent(
	transaction: Prisma.TransactionClient,
	input: RecordBoardEventInput,
): Promise<void> {
	await transaction.activity.create({
		data: {
			requestId: requestStorage.getStore()?.requestId,
			actorId: input.actorId,
			boardId: input.boardId,
			eventName: input.eventName,
			message: input.message,
			payload: input.payload,
		},
	});
	await transaction.outboxEvent.create({
		data: {
			boardId: input.boardId,
			requestId: requestStorage.getStore()?.requestId,
			aggregateId: input.boardId,
			aggregateType: "board",
			eventName: input.eventName,
			payload: input.payload,
		},
	});
}
