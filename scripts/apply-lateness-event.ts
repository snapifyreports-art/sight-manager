/**
 * (#191) Apply LatenessEvent table + enums. Idempotent.
 *
 * One row per (target, kind, day-it-first-went-late). The daily
 * cron upserts on this unique key so duplicates don't accumulate.
 * Managers tag reason + attribution; reports aggregate.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating LatenessKind enum…");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "LatenessKind" AS ENUM (
        'JOB_END_OVERDUE',
        'JOB_START_OVERDUE',
        'ORDER_DELIVERY_OVERDUE',
        'ORDER_SEND_OVERDUE'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  console.log("Creating LatenessReason enum…");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "LatenessReason" AS ENUM (
        'WEATHER_RAIN',
        'WEATHER_TEMPERATURE',
        'WEATHER_WIND',
        'MATERIAL_LATE',
        'MATERIAL_WRONG',
        'MATERIAL_SHORT',
        'LABOUR_NO_SHOW',
        'LABOUR_SHORT',
        'DESIGN_CHANGE',
        'SPEC_CLARIFICATION',
        'PREDECESSOR_LATE',
        'ACCESS_BLOCKED',
        'INSPECTION_FAILED',
        'OTHER'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  console.log("Extending EventType enum with LATENESS_OPENED / LATENESS_RESOLVED…");
  // ALTER TYPE ADD VALUE is non-transactional; conditional via pg_type lookup.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'EventType' AND e.enumlabel = 'LATENESS_OPENED') THEN
        ALTER TYPE "EventType" ADD VALUE 'LATENESS_OPENED';
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'EventType' AND e.enumlabel = 'LATENESS_RESOLVED') THEN
        ALTER TYPE "EventType" ADD VALUE 'LATENESS_RESOLVED';
      END IF;
    END $$;
  `);

  console.log("Creating LatenessEvent table…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LatenessEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "kind" "LatenessKind" NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "siteId" TEXT NOT NULL,
      "plotId" TEXT,
      "jobId" TEXT,
      "orderId" TEXT,
      "wentLateOn" TIMESTAMP(3) NOT NULL,
      "daysLate" INTEGER NOT NULL DEFAULT 1,
      "resolvedAt" TIMESTAMP(3),
      "reasonCode" "LatenessReason" NOT NULL DEFAULT 'OTHER',
      "reasonNote" TEXT,
      "attributedContactId" TEXT,
      "recordedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LatenessEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE,
      CONSTRAINT "LatenessEvent_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL,
      CONSTRAINT "LatenessEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL,
      CONSTRAINT "LatenessEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaterialOrder"("id") ON DELETE SET NULL,
      CONSTRAINT "LatenessEvent_attributedContactId_fkey" FOREIGN KEY ("attributedContactId") REFERENCES "Contact"("id") ON DELETE SET NULL,
      CONSTRAINT "LatenessEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL
    );
  `);

  console.log("Adding LatenessEvent indexes…");
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "LatenessEvent_target_kind_wentLateOn_key" ON "LatenessEvent"("targetType", "targetId", "kind", "wentLateOn");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LatenessEvent_siteId_wentLateOn_idx" ON "LatenessEvent"("siteId", "wentLateOn");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LatenessEvent_resolvedAt_idx" ON "LatenessEvent"("resolvedAt");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LatenessEvent_attributedContactId_idx" ON "LatenessEvent"("attributedContactId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LatenessEvent_reasonCode_idx" ON "LatenessEvent"("reasonCode");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LatenessEvent_plotId_idx" ON "LatenessEvent"("plotId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LatenessEvent_jobId_idx" ON "LatenessEvent"("jobId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LatenessEvent_orderId_idx" ON "LatenessEvent"("orderId");`,
  );
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
