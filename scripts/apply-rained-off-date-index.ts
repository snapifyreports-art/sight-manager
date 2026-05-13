/**
 * (May 2026 audit S-P1) Single-column index on RainedOffDay.date.
 *
 * The composite unique (siteId, date, type) doesn't serve cross-site
 * date-range queries — weather cron + analytics ask "all rained-off
 * days in range X" across every site they have access to. Adding a
 * standalone date index keeps those scans tight.
 *
 * Idempotent — uses IF NOT EXISTS. Schema.prisma updated separately
 * so the Prisma client + future `db push` stay in sync.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  process.stdout.write("  · RainedOffDay_date_idx… ");
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "RainedOffDay_date_idx" ON "RainedOffDay"("date")`,
  );
  console.log("ok");
  console.log("\nApplied 1 index (idempotent).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
