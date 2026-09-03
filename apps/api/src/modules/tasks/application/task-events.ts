import type { Prisma } from "../../../generated/prisma/client.js";

export const TaskEventName = {
	CREATED: "task.created",
	DELETED: "task.deleted",
	MOVED: "task.moved",
	UPDATED: "task.updated",
} as const;

export type TaskEventName = (typeof TaskEventName)[keyof typeof TaskEventName];

interface RecordTaskEventInput {
	actorId: string;
	boardId: string;
	eventName: TaskEventName;
	message: string;
	payload: Prisma.InputJsonObject;
	taskId: string;
}

export async function recordTaskEvent(
	transaction: Prisma.TransactionClient,
	input: RecordTaskEventInput,
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
			aggregateId: input.taskId,
			aggregateType: "task",
			eventName: input.eventName,
			payload: input.payload,
		},
	});
}
