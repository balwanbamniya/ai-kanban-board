import type { Prisma } from "../../../generated/prisma/client.js";

export const AiEventName = {
	QUEUED: "ai.run.queued",
} as const;

interface RecordAiEventInput {
	actorId: string;
	boardId: string;
	eventName: (typeof AiEventName)[keyof typeof AiEventName];
	operationKind: string;
	runId: string;
}

export async function recordAiEvent(
	transaction: Prisma.TransactionClient,
	input: RecordAiEventInput,
): Promise<void> {
	const payload = {
		operationKind: input.operationKind,
		runId: input.runId,
	};
	await transaction.activity.create({
		data: {
			actorId: input.actorId,
			boardId: input.boardId,
			eventName: input.eventName,
			message: "AI run queued",
			payload,
		},
	});
	await transaction.outboxEvent.create({
		data: {
			aggregateId: input.runId,
			aggregateType: "ai_run",
			eventName: input.eventName,
			payload,
		},
	});
}
