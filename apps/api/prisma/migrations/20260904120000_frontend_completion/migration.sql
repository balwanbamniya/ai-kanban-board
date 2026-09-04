ALTER TABLE "columns" ADD COLUMN "is_completed" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "tasks_due_date_id_idx" ON "tasks"("due_date", "id");
CREATE INDEX "tasks_assignee_id_due_date_id_idx" ON "tasks"("assignee_id", "due_date", "id");
