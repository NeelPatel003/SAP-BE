-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "replaced_by_id" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_agent" VARCHAR(512);
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip" VARCHAR(64);
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "label" VARCHAR(120);

-- Backfill family_id for existing rows
UPDATE "refresh_tokens" SET "family_id" = "id" WHERE "family_id" IS NULL;

ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
