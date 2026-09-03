-- AlterTable
ALTER TABLE "users"
ALTER COLUMN "email" DROP NOT NULL,
ADD COLUMN "identity_provider_updated_at" TIMESTAMPTZ(6),
ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
