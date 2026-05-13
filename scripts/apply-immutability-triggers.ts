/**
 * (May 2026 audit B-P0-? + B-P1-28) Postgres triggers enforcing the
 * append-only contract on audit tables.
 *
 * EventLog and JobAction are documented as immutable but the contract
 * is convention only — a future bug, a careless developer, or anyone
 * with raw DB access could mutate the audit trail and nobody would
 * know. For housing contracts / handover certificates / disputes
 * with buyers, an immutable trail is the difference between "we can
 * prove it" and "they say, we say".
 *
 * This script installs two trigger functions and four triggers
 * (BEFORE UPDATE + BEFORE DELETE on each table). Any attempt to
 * UPDATE or DELETE a row raises an exception with a clear message.
 *
 * **Escape hatch**: if a row ever genuinely needs editing (typo in a
 * description, GDPR right-to-erasure, etc.), drop the trigger
 * temporarily, fix the row, recreate the trigger. The act of
 * dropping the trigger is itself audited at the Postgres level so
 * there's still a paper trail.
 *
 * Idempotent — re-running drops the existing trigger/function and
 * recreates.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = ["EventLog", "JobAction"] as const;

async function main() {
  for (const table of TABLES) {
    process.stdout.write(`  · ${table} immutability… `);
    const fnName = `${table.toLowerCase()}_immutability`;
    const updTriggerName = `${table.toLowerCase()}_no_update`;
    const delTriggerName = `${table.toLowerCase()}_no_delete`;

    // 1. Drop any existing triggers + function first (idempotency).
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${updTriggerName}" ON "${table}";`,
    );
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${delTriggerName}" ON "${table}";`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${fnName}"();`,
    );

    // 2. Create the trigger function. Raises a clear exception that
    //    surfaces in Prisma's error path so the developer knows why
    //    their write was rejected.
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${fnName}"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '${table} is append-only — UPDATE and DELETE are forbidden. To fix a row, drop the trigger temporarily (see scripts/apply-immutability-triggers.ts header).';
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 3. Attach BEFORE UPDATE and BEFORE DELETE triggers.
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${updTriggerName}"
      BEFORE UPDATE ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION "${fnName}"();
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${delTriggerName}"
      BEFORE DELETE ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION "${fnName}"();
    `);

    console.log("ok");
  }

  console.log(`\nApplied immutability triggers on ${TABLES.join(", ")}.`);
  console.log(
    "Any future UPDATE or DELETE on these tables will raise a Postgres exception.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
