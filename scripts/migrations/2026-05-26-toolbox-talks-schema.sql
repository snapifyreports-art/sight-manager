-- (May 2026 batch 229) Toolbox-talks request-workflow + multi-attachments
--
-- Apply this in Supabase SQL Editor (Dashboard → SQL Editor → New query →
-- paste → Run). Additive-only: new columns have defaults so existing
-- rows backfill, new table is empty, NOT NULL → nullable on
-- deliveredAt is non-destructive.
--
-- Idempotent: every statement uses IF NOT EXISTS / DROP NOT NULL so
-- running twice is safe.

-- 1. New enum for the request lifecycle
DO $$ BEGIN
  CREATE TYPE "TBTStatus" AS ENUM ('REQUESTED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. New columns on ToolboxTalk. Defaults backfill every existing row
--    (Postgres applies DEFAULT during ALTER TABLE ADD COLUMN), so all
--    legacy rows land as status = COMPLETED with requestedAt = now.
ALTER TABLE "ToolboxTalk"
  ADD COLUMN IF NOT EXISTS "status" "TBTStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "requestedById" TEXT,
  ADD COLUMN IF NOT EXISTS "dueBy" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailSentToCount" INTEGER;

-- 3. deliveredAt now nullable — REQUESTED rows have no delivery yet.
--    Existing COMPLETED rows keep their non-null value.
ALTER TABLE "ToolboxTalk" ALTER COLUMN "deliveredAt" DROP NOT NULL;

-- 4. Multi-attachment table — replaces the legacy single
--    documentUrl/documentFileName/documentSize/documentMimeType columns
--    (those stay for back-compat reads of old rows; new code writes here).
CREATE TABLE IF NOT EXISTS "ToolboxTalkAttachment" (
  "id" TEXT NOT NULL,
  "talkId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "size" INTEGER,
  "mimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolboxTalkAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ToolboxTalkAttachment_talkId_idx"
  ON "ToolboxTalkAttachment"("talkId");

-- FK to ToolboxTalk. Guarded so re-running doesn't error on existing
-- constraint.
DO $$ BEGIN
  ALTER TABLE "ToolboxTalkAttachment"
    ADD CONSTRAINT "ToolboxTalkAttachment_talkId_fkey"
    FOREIGN KEY ("talkId") REFERENCES "ToolboxTalk"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 5. New compound index for status-filtered queries (closure readiness,
--    Story toolboxTalks rollup, contractor-comms COMPLETED filter).
CREATE INDEX IF NOT EXISTS "ToolboxTalk_siteId_status_idx"
  ON "ToolboxTalk"("siteId", "status");

-- Verify: should return rows with the new columns present.
-- SELECT id, status, "requestedAt", "deliveredAt"
-- FROM "ToolboxTalk" LIMIT 3;
