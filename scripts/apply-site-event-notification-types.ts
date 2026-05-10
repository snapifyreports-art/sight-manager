/**
 * (May 2026 audit follow-up to #152) Add per-site event NotificationType
 * enum values via raw SQL on the pooled connection. Same idempotent
 * pattern as the customer-share / completedAt / watched-sites scripts.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding per-site event NotificationType enum values…");

  // Postgres lets you add new enum values atomically with IF NOT EXISTS.
  for (const value of ["SNAG_RAISED", "DELIVERY_CONFIRMED", "JOB_MILESTONE"]) {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS '${value}';`,
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
