/**
 * (May 2026 audit B-P1-? / S-P1-7/8/9) Postgres CHECK constraints on
 * columns that the application treats as a closed set of values.
 *
 * Pre-fix these are typed as `String` / `String?` in Prisma. The
 * application code branches on specific string values but nothing
 * prevents a typo from being written:
 *   `prisma.jobAction.create({ data: { action: "started" }})` — typo,
 *   accepted, the Story tab's `if (action === "start")` doesn't
 *   match, the row silently never renders.
 *
 * Why CHECK constraints rather than Prisma enums:
 *   - No schema-side type change (Prisma keeps seeing `String`)
 *   - No data normalisation step (existing rows already conform —
 *     verified before this script runs)
 *   - Easy to add a new allowed value later (drop + recreate the
 *     constraint with the extra value, ~30s)
 *   - Same defensive guarantee — Postgres rejects bad writes
 *
 * Tables / columns covered:
 *   JobAction.action          → {start, stop, complete, signoff, note}
 *   Job.weatherAffectedType   → {RAIN, TEMPERATURE, BOTH} or NULL
 *   LatenessEvent.targetType  → {job, order}
 *
 * Idempotent — re-running drops + recreates each constraint.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Constraint {
  table: string;
  column: string;
  constraintName: string;
  /** Returns the SQL expression that evaluates true for valid values. */
  expression: string;
  /** Pre-flight: detect any existing rows that would violate the
   *  constraint, so we can fail loudly with actionable output rather
   *  than have Postgres reject the ALTER. */
  detectViolations: string;
}

const constraints: Constraint[] = [
  {
    table: "JobAction",
    column: "action",
    constraintName: "JobAction_action_check",
    expression: `"action" IN ('start', 'stop', 'complete', 'signoff', 'note')`,
    detectViolations: `SELECT DISTINCT "action" FROM "JobAction" WHERE "action" NOT IN ('start', 'stop', 'complete', 'signoff', 'note')`,
  },
  {
    table: "Job",
    column: "weatherAffectedType",
    constraintName: "Job_weatherAffectedType_check",
    expression: `"weatherAffectedType" IS NULL OR "weatherAffectedType" IN ('RAIN', 'TEMPERATURE', 'BOTH')`,
    detectViolations: `SELECT DISTINCT "weatherAffectedType" FROM "Job" WHERE "weatherAffectedType" IS NOT NULL AND "weatherAffectedType" NOT IN ('RAIN', 'TEMPERATURE', 'BOTH')`,
  },
  {
    table: "LatenessEvent",
    column: "targetType",
    constraintName: "LatenessEvent_targetType_check",
    expression: `"targetType" IN ('job', 'order')`,
    detectViolations: `SELECT DISTINCT "targetType" FROM "LatenessEvent" WHERE "targetType" NOT IN ('job', 'order')`,
  },
];

async function main() {
  // Pre-flight: scan for any existing data violations.
  console.log("Pre-flight scan…");
  for (const c of constraints) {
    const result: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(c.detectViolations);
    if (result.length > 0) {
      console.error(
        `  · ${c.table}.${c.column} has non-conforming values: ${JSON.stringify(result)}`,
      );
      console.error(
        "Refusing to apply constraint until these are normalised manually.",
      );
      process.exit(1);
    }
    console.log(`  · ${c.table}.${c.column}: clean.`);
  }

  // Apply each constraint.
  console.log("\nApplying constraints…");
  for (const c of constraints) {
    process.stdout.write(`  · ${c.constraintName}… `);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${c.table}" DROP CONSTRAINT IF EXISTS "${c.constraintName}";`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.constraintName}" CHECK (${c.expression});`,
    );
    console.log("ok");
  }
  console.log(`\nApplied ${constraints.length} CHECK constraints.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
