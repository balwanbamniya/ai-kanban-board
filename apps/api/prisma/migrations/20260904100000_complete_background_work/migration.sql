ALTER TABLE outbox_events
 ADD COLUMN board_id UUID,
 ADD COLUMN request_id TEXT,
 ADD COLUMN lease_token UUID,
 ADD COLUMN lease_expires_at TIMESTAMPTZ(6),
 ADD COLUMN next_attempt_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ai_runs
 ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN lease_token UUID,
 ADD COLUMN lease_expires_at TIMESTAMPTZ(6),
 ADD COLUMN next_attempt_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE ai_applications (
 id UUID PRIMARY KEY,
 run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
 idempotency_key TEXT NOT NULL,
 actor_id UUID NOT NULL,
 input JSONB NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(run_id, idempotency_key)
);
CREATE TABLE ai_applied_suggestions (
 run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
 suggestion_index INTEGER NOT NULL CHECK (suggestion_index >= 0 AND suggestion_index < 20),
 task_id UUID NOT NULL,
 PRIMARY KEY(run_id, suggestion_index)
);
-- Recover routing without assuming deleted aggregate records still exist.
UPDATE outbox_events SET board_id = aggregate_id WHERE aggregate_type = 'board';
UPDATE outbox_events o SET board_id = a.board_id FROM activities a
 WHERE o.board_id IS NULL AND a.event_name = o.event_name AND a.payload = o.payload;
UPDATE outbox_events o SET board_id = t.board_id FROM tasks t
 WHERE o.board_id IS NULL AND o.aggregate_type = 'task' AND o.aggregate_id = t.id;
UPDATE outbox_events o SET board_id = c.board_id FROM columns c
 WHERE o.board_id IS NULL AND o.aggregate_type = 'column' AND o.aggregate_id = c.id;
UPDATE outbox_events o SET board_id = a.board_id FROM ai_runs a
 WHERE o.board_id IS NULL AND o.aggregate_type = 'ai_run' AND o.aggregate_id = a.id;
UPDATE outbox_events SET status = 'FAILED', last_error = 'Legacy event has no recoverable board route; refresh board state.'
 WHERE board_id IS NULL AND status IN ('PENDING','PROCESSING');
-- Old queued requests used an unspecified input shape and cannot be executed safely.
UPDATE ai_runs SET status = 'FAILED', error_message = 'Legacy queued request; submit a new request using the documented input.', completed_at = CURRENT_TIMESTAMP
 WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX outbox_events_claim_idx ON outbox_events(status, next_attempt_at);
CREATE INDEX ai_runs_claim_idx ON ai_runs(status, next_attempt_at);
