-- DropIndex
DROP INDEX "columns_board_id_sort_key_idx";

-- Domain invariants not expressible in the Prisma schema
ALTER TABLE "boards" ADD CONSTRAINT "boards_version_positive" CHECK ("version" > 0);
ALTER TABLE "columns" ADD CONSTRAINT "columns_version_positive" CHECK ("version" > 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_version_positive" CHECK ("version" > 0);
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempts_nonnegative" CHECK ("attempts" >= 0);
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_latency_nonnegative" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0);
