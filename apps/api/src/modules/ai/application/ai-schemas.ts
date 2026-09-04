import { z } from "zod";
export const generationInput = z
	.object({
		instructions: z.string().trim().min(1).max(5000),
		count: z.number().int().min(1).max(20).default(5),
	})
	.strict();
export const summaryInput = z
	.object({ instructions: z.string().trim().min(1).max(5000).optional() })
	.strict();
export const taskSuggestions = z
	.object({
		tasks: z
			.array(
				z
					.object({
						title: z.string().trim().min(1).max(200),
						description: z.string().max(5000).nullable(),
						priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
					})
					.strict(),
			)
			.min(1)
			.max(20),
	})
	.strict();
export const boardSummary = z
	.object({
		overview: z.string().min(1).max(5000),
		blockers: z.array(z.string().max(1000)).max(20),
		nextActions: z.array(z.string().max(1000)).max(20),
	})
	.strict();
