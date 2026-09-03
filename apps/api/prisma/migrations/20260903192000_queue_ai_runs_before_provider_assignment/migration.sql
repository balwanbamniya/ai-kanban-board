-- Provider routing happens when a future worker claims a queued run.
ALTER TABLE "ai_runs" ALTER COLUMN "provider" DROP NOT NULL;
ALTER TABLE "ai_runs" ALTER COLUMN "model" DROP NOT NULL;
