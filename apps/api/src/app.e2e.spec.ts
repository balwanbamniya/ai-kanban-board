import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import "reflect-metadata";
import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
import { AppModule } from "./app.module.js";

describe("health endpoint", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleRef.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("returns the service status", async () => {
		await request(app.getHttpServer())
			.get("/health")
			.expect(200)
			.expect({ status: "ok" });
	});
});
