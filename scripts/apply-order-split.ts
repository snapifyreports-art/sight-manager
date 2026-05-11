/**
 * (#169) Add MaterialOrder.isSplit column for the "split out plot from
 * order" feature. Idempotent — safe to run on already-migrated DBs.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding MaterialOrder.isSplit…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "MaterialOrder" ADD COLUMN IF NOT EXISTS "isSplit" BOOLEAN NOT NULL DEFAULT false;`,
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
