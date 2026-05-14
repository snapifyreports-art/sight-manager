/**
 * (May 2026 Story-completeness pass) Two additive EventLog changes:
 *
 *   1. `detail` JSONB column — a structured payload so the Site Story
 *      reads typed fields instead of regex-parsing the `description`
 *      string (a class of bug we've already been bitten by).
 *
 *   2. Six new EventType enum values — ORDER_SENT, DELIVERY_LATE,
 *      PLOT_COMPLETED, HANDOVER_COMPLETED, PHOTO_SHARED, WEATHER_IMPACT
 *      — so per-plot timelines can show order timing, weather and
 *      handover milestones distinctly, rather than burying everything
 *      under ORDER_PLACED / SYSTEM.
 *
 * Idempotent — IF NOT EXISTS on the column, ADD VALUE IF NOT EXISTS on
 * the enum. Same pattern as the other scripts/apply-*.ts. Safe to re-run.
 *
 *   npx tsx scripts/apply-event-log-detail-schema.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding EventLog.detail JSONB column…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "EventLog"
    ADD COLUMN IF NOT EXISTS "detail" JSONB;
  `);

  console.log("Adding new EventType enum values…");
  // Postgres lets you add new enum values atomically with IF NOT EXISTS.
  for (const value of [
    "ORDER_SENT",
    "DELIVERY_LATE",
    "PLOT_COMPLETED",
    "HANDOVER_COMPLETED",
    "PHOTO_SHARED",
    "WEATHER_IMPACT",
  ]) {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS '${value}';`,
    );
    console.log(`  · added '${value}' (or already present).`);
  }

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
