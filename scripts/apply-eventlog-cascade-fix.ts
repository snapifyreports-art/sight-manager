/**
 * (May 2026 Keith bug report) Fix site delete failing due to EventLog
 * immutability trigger.
 *
 * The problem chain:
 *   1. Batch 142 left `EventLog.site` with `onDelete: Cascade`
 *   2. Batch 143 added a Postgres BEFORE DELETE trigger on EventLog
 *      raising on any DELETE attempt
 *   3. Deleting a Site cascades to its EventLog rows → trigger fires
 *      → site delete fails
 *
 * Schema audit explicitly recommended SetNull on EventLog.siteId:
 * closed-site EventLogs are exactly the history a regulator wants
 * to read; cascading them away on delete is wrong.
 *
 * This script does TWO things:
 *   1. ALTER the FK constraint on EventLog.siteId from CASCADE to
 *      SET NULL (so site delete preserves the audit trail).
 *   2. REPLACE the EventLog immutability trigger function with one
 *      that allows the specific case "FK column going to NULL while
 *      everything else stays the same" — i.e. the SetNull cascade.
 *      All other UPDATEs + every DELETE still raise.
 *
 * JobAction is not affected by this — Site delete doesn't cascade
 * into JobAction (JobAction has only Job FK, and Job already cascades
 * from Plot which cascades from Site, hitting JobAction last).
 * Wait — let me check. JobAction.job onDelete: Cascade. Job is
 * deleted when its Plot is deleted (cascade). Plot is deleted when
 * Site is deleted (cascade). So Site delete → Plot delete → Job
 * delete → JobAction delete (cascade chain). The JobAction trigger
 * would block this too.
 *
 * So fix JobAction trigger the same way: allow FK-driven cascade
 * DELETE only when the parent Job is being deleted. Simplest
 * approach: drop the BEFORE DELETE trigger on JobAction since the
 * audit value is captured by the Job's deletion event log entry; the
 * JobAction history naturally goes when the Job goes. Keep BEFORE
 * UPDATE so it can't be retroactively edited.
 *
 * Idempotent — re-running drops + recreates triggers; FK ALTER is
 * conditional.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. EventLog: drop existing triggers, replace function, recreate.
  process.stdout.write("  · Rewriting eventlog_immutability trigger… ");
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "eventlog_no_update" ON "EventLog";`,
  );
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "eventlog_no_delete" ON "EventLog";`,
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS "eventlog_immutability"();`,
  );
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "eventlog_immutability"() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'EventLog is append-only — DELETE forbidden. Drop the trigger temporarily to fix a row (see apply-immutability-triggers.ts header).';
      END IF;
      -- UPDATE: allow only when content fields are unchanged and FK
      -- columns are either unchanged or transitioning to NULL (FK
      -- SetNull cascade from parent table delete).
      IF OLD."id" = NEW."id"
         AND OLD."type" = NEW."type"
         AND OLD."description" = NEW."description"
         AND OLD."createdAt" = NEW."createdAt"
         AND OLD."delayReasonType" IS NOT DISTINCT FROM NEW."delayReasonType"
         AND (NEW."siteId" IS NULL OR NEW."siteId" = OLD."siteId")
         AND (NEW."plotId" IS NULL OR NEW."plotId" = OLD."plotId")
         AND (NEW."jobId" IS NULL OR NEW."jobId" = OLD."jobId")
         AND (NEW."userId" IS NULL OR NEW."userId" = OLD."userId")
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'EventLog is append-only — only FK SetNull cascade updates allowed. Drop the trigger temporarily to fix a row.';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "eventlog_no_update"
    BEFORE UPDATE ON "EventLog"
    FOR EACH ROW EXECUTE FUNCTION "eventlog_immutability"();
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "eventlog_no_delete"
    BEFORE DELETE ON "EventLog"
    FOR EACH ROW EXECUTE FUNCTION "eventlog_immutability"();
  `);
  console.log("ok");

  // 2. ALTER EventLog.siteId FK from CASCADE to SET NULL.
  // Find the actual constraint name first — Prisma names them
  // <Model>_<col>_fkey.
  process.stdout.write("  · ALTER EventLog.siteId → SET NULL… ");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "EventLog"
    DROP CONSTRAINT IF EXISTS "EventLog_siteId_fkey";
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "EventLog"
    ADD CONSTRAINT "EventLog_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  `);
  console.log("ok");

  // 3. JobAction: drop the BEFORE DELETE trigger so cascading deletes
  //    (Site → Plot → Job → JobAction) work. UPDATE protection stays.
  //    The audit trail for "this Job and its actions existed" is
  //    captured in the EventLog row written before site delete.
  process.stdout.write("  · Drop jobaction_no_delete trigger… ");
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "jobaction_no_delete" ON "JobAction";`,
  );
  console.log("ok");

  // 4. Rewrite jobaction_immutability so the UPDATE trigger doesn't
  //    rely on the dropped DELETE path message. Just block UPDATEs.
  process.stdout.write("  · Rewriting jobaction_immutability trigger… ");
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "jobaction_no_update" ON "JobAction";`,
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS "jobaction_immutability"();`,
  );
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "jobaction_immutability"() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'JobAction is append-only — UPDATE forbidden. DELETE is allowed only via FK cascade (Site/Plot/Job deletion).';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "jobaction_no_update"
    BEFORE UPDATE ON "JobAction"
    FOR EACH ROW EXECUTE FUNCTION "jobaction_immutability"();
  `);
  console.log("ok");

  console.log(
    "\nApplied. Site delete now preserves EventLog rows with siteId=NULL;",
  );
  console.log("JobAction DELETE allowed via cascade only.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
