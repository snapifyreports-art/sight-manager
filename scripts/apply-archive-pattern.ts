/**
 * (May 2026 audit S-P0) Apply the soft-delete `archivedAt` pattern to
 * the remaining models that need it after User (sprint 6e).
 *
 *   Contact       — contractors / clients / one-off contacts. Archive
 *                   when an external person stops working with you.
 *   Supplier      — material suppliers. Archive when a relationship ends.
 *   PlotTemplate  — retired house types. Templates with historical Plot
 *                   references can't be hard-deleted; archive instead.
 *
 * Site already has `status: ACTIVE | ON_HOLD | COMPLETED | ARCHIVED`.
 * Plot already has `awaitingRestart` + Site.status cascade. Both
 * already have soft-delete-equivalent states, so no archivedAt here.
 *
 * Idempotent — uses IF NOT EXISTS.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = ["Contact", "Supplier", "PlotTemplate"] as const;

async function main() {
  for (const table of TABLES) {
    process.stdout.write(`  · ${table}.archivedAt… `);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);`,
    );
    console.log("ok");
  }
  console.log(`\nApplied archivedAt to ${TABLES.length} tables.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
