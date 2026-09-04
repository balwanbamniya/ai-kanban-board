import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const prefix = `kanban-test-${process.pid}`;
const containers = [];
function command(bin, args, options = {}) {
	return execFileSync(bin, args, { cwd, encoding: "utf8", ...options });
}
try {
	for (const [name, image, port, extra] of [
		[
			`${prefix}-pg`,
			"postgres:16-alpine",
			"5432",
			[
				"-e",
				"POSTGRES_USER=test",
				"-e",
				"POSTGRES_PASSWORD=test",
				"-e",
				"POSTGRES_DB=kanban_test",
				"--tmpfs",
				"/var/lib/postgresql/data",
			],
		],
		[`${prefix}-redis`, "redis:7-alpine", "6379", []],
	]) {
		command("docker", [
			"run",
			"-d",
			"--name",
			name,
			"-p",
			`127.0.0.1::${port}`,
			...extra,
			image,
		]);
		containers.push(name);
	}
	let ready = false;
	for (let attempt = 0; attempt < 30; attempt++) {
		try {
			command(
				"docker",
				[
					"exec",
					containers[0],
					"pg_isready",
					"-U",
					"test",
					"-d",
					"kanban_test",
				],
				{ stdio: "ignore" },
			);
			ready = true;
			break;
		} catch {
			await setTimeout(500);
		}
	}
	if (!ready) throw new Error("Test PostgreSQL failed to become ready");
	const pgPort = command("docker", ["port", containers[0], "5432/tcp"])
		.trim()
		.split(":")
		.at(-1);
	const redisPort = command("docker", ["port", containers[1], "6379/tcp"])
		.trim()
		.split(":")
		.at(-1);
	const env = {
		...process.env,
		DATABASE_URL: `postgresql://test:test@127.0.0.1:${pgPort}/kanban_test`,
		REDIS_URL: `redis://127.0.0.1:${redisPort}`,
		WORKERS_ENABLED: "false",
		OPENAI_API_KEY: "test-fixture",
		OPENAI_MODEL: "test-fixture",
	};
	for (const script of [
		"db:migrate:deploy",
		"db:seed",
		"db:seed",
		"test:integration",
	])
		command("pnpm", ["run", script], { env, stdio: "inherit" });
} catch (error) {
	console.error(
		error instanceof Error ? error.message : "Integration tests failed",
	);
	process.exitCode = 1;
} finally {
	for (const name of containers) {
		try {
			command("docker", ["rm", "-f", name], { stdio: "ignore" });
		} catch {
			console.error(`Could not remove test container ${name}`);
		}
	}
}
