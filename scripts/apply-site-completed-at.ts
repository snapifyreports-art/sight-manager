/**
 * Apply Site.completedAt column via raw SQL on the pooled connection.
 * Direct port-5432 connection isn't reachable from this environment so
 * `prisma db push` fails — same pattern as the customer-share + delay-
 * reasons schema scripts.
 *
 * Idempotent — re-running is safe.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding Site.completedAt column…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Site"
    ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
  `);

  // Backfill: any site already in COMPLETED status gets its updatedAt
  // copied across so the Story / ZIP have a defensible end-date even
  // for historical sites that closed before this column existed.
  const backfilled = await prisma.$executeRawUnsafe(`
    UPDATE "Site"
    SET "completedAt" = "updatedAt"
    WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL;
  `);
  console.log(`  · backfilled ${backfilled} completed sites from updatedAt.`);

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
