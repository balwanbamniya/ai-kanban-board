import type { Prisma } from "../../../generated/prisma/client.js";

export const ColumnEventName = {
	CREATED: "column.created",
	DELETED: "column.deleted",
	REORDERED: "column.reordered",
	UPDATED: "column.updated",
} as const;

export type ColumnEventName =
	(typeof ColumnEventName)[keyof typeof ColumnEventName];

interface RecordColumnEventInput {
	actorId: string;
	aggregateId: string;
	boardId: string;
	eventName: ColumnEventName;
	message: string;
	payload: Prisma.InputJsonObject;
}

export async function recordColumnEvent(
	transaction: Prisma.TransactionClient,
	input: RecordColumnEventInput,
): Promise<void> {
	await transaction.activity.create({
		data: {
			actorId: input.actorId,
			boardId: input.boardId,
			eventName: input.eventName,
			message: input.message,
			payload: input.payload,
		},
	});
	await transaction.outboxEvent.create({
		data: {
			aggregateId: input.aggregateId,
			aggregateType: "column",
			eventName: input.eventName,
			payload: input.payload,
		},
	});
}
