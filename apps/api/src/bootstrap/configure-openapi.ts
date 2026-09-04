import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppConfigService } from "../config/app-config.service.js";

export function configureOpenApi(app: INestApplication): void {
	const config = app.get(AppConfigService);
	if (!config.swaggerEnabled) {
		return;
	}

	const document = SwaggerModule.createDocument(
		app,
		new DocumentBuilder()
			.setTitle("AI Kanban API")
			.setDescription("The AI Kanban REST API.")
			.setVersion("v1")
			.addBearerAuth()
			.build(),
	);

	document.components ??= {};
	document.components.schemas ??= {};
	document.components.schemas.ProblemDetails = {
		type: "object",
		required: ["type", "title", "status", "detail", "instance", "requestId"],
		properties: {
			type: { type: "string" },
			title: { type: "string" },
			status: { type: "integer" },
			detail: { type: "string" },
			instance: { type: "string" },
			requestId: { type: "string" },
			errors: { type: "array", items: { type: "string" } },
		},
	};
	for (const path of Object.values(document.paths)) {
		for (const method of ["get", "post", "patch", "put", "delete"] as const) {
			const operation = path[method];
			if (!operation) continue;
			for (const status of [
				"400",
				"401",
				"403",
				"404",
				"409",
				"413",
				"429",
				"500",
				"503",
			]) {
				const existing = operation.responses[status];
				operation.responses[status] = {
					description:
						existing && "description" in existing
							? existing.description
							: "Request failed",
					content: {
						"application/problem+json": {
							schema: { $ref: "#/components/schemas/ProblemDetails" },
						},
					},
				};
			}
		}
	}

	SwaggerModule.setup("docs", app, document, {
		jsonDocumentUrl: "docs-json",
	});
}
