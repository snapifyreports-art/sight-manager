/**
 * Postgres triggers enforcing the append-only contract on the audit
 * tables (EventLog, JobAction).
 *
 * EventLog and JobAction are documented as immutable but the contract is
 * convention only — a future bug, a careless developer, or anyone with raw
 * DB access could mutate the audit trail and nobody would know. For housing
 * contracts / handover certificates / disputes with buyers, an immutable
 * trail is the difference between "we can prove it" and "they say, we say".
 *
 * (Jun 2026 Keith bug report — CANONICAL, supersedes apply-eventlog-cascade-fix.ts)
 * The original version of this script created a BEFORE DELETE trigger on
 * BOTH tables that raised UNCONDITIONALLY. That quietly broke deleting a
 * Site / Plot / Job: the delete cascade legitimately removes the entity's
 * audit rows (or nulls their FKs), the trigger fired, and the whole delete
 * aborted. Result: the delete-site button failed for any site that had had
 * job activity (i.e. every real site). This corrected version encodes the
 * proper contract:
 *
 *   EventLog:
 *     - BEFORE UPDATE: allow ONLY a SetNull FK transition (site/plot/job
 *       delete nulls the FK so the closed-site audit trail is preserved,
 *       just disconnected). ANY content change still raises.
 *     - BEFORE DELETE: always raises. EventLog FKs are all ON DELETE SET
 *       NULL, so it is never cascade-deleted — a DELETE is always a tamper
 *       attempt.
 *
 *   JobAction:
 *     - BEFORE UPDATE: always raises (content is immutable).
 *     - NO BEFORE DELETE trigger. JobAction.jobId is ON DELETE CASCADE, so
 *       its rows go when the Job goes — legitimate; the "this job existed"
 *       fact is captured in the EventLog. A standalone direct DELETE is an
 *       accepted trade-off (the higher-value protection is against UPDATE,
 *       i.e. editing what an action recorded).
 *
 * **Escape hatch**: if an audit row ever genuinely needs editing (typo,
 * GDPR erasure), drop the relevant trigger, fix the row, recreate it. The
 * DDL is itself audited at the Postgres level.
 *
 * Idempotent — re-running drops + recreates. Run with
 * `npx tsx -r dotenv/config scripts/apply-immutability-triggers.ts`.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ─── EventLog: UPDATE allowed only for FK-SetNull cascades; DELETE never ───
  process.stdout.write("  · EventLog immutability… ");
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "eventlog_no_update" ON "EventLog";`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "eventlog_no_delete" ON "EventLog";`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "eventlog_immutability"();`);
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "eventlog_immutability"() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'EventLog is append-only — DELETE forbidden. Drop the trigger temporarily to fix a row (see apply-immutability-triggers.ts header).';
      END IF;
      -- UPDATE: allow only when content is unchanged and FK columns are
      -- either unchanged or transitioning to NULL (the Site/Plot/Job delete
      -- cascade SetNull). Anything else is a tamper attempt.
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
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "eventlog_no_update" BEFORE UPDATE ON "EventLog" FOR EACH ROW EXECUTE FUNCTION "eventlog_immutability"();`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "eventlog_no_delete" BEFORE DELETE ON "EventLog" FOR EACH ROW EXECUTE FUNCTION "eventlog_immutability"();`);
  console.log("ok");

  // ─── JobAction: UPDATE forbidden; NO before-delete (so cascades work) ───
  process.stdout.write("  · JobAction immutability… ");
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "jobaction_no_update" ON "JobAction";`);
  // CRITICAL: ensure there is NO before-delete trigger. Creating one here
  // is what broke Site/Plot/Job deletion — do NOT re-add it.
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "jobaction_no_delete" ON "JobAction";`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "jobaction_immutability"();`);
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "jobaction_immutability"() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'JobAction is append-only — UPDATE forbidden. (DELETE is permitted only via the Site/Plot/Job cascade.)';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "jobaction_no_update" BEFORE UPDATE ON "JobAction" FOR EACH ROW EXECUTE FUNCTION "jobaction_immutability"();`);
  console.log("ok");

  console.log("\nApplied corrected immutability triggers on EventLog + JobAction.");
  console.log("EventLog: content immutable, FK-SetNull cascade allowed, no delete.");
  console.log("JobAction: content immutable (no UPDATE); cascade DELETE permitted.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
