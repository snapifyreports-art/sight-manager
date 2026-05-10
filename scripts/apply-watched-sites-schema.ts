/**
 * (May 2026 audit #152) Apply WatchedSite table via raw SQL on the
 * pooled connection. Direct port-5432 connection isn't reachable from
 * this environment so `prisma db push` fails — same pattern as the
 * customer-share + completedAt schema scripts.
 *
 * Idempotent — re-running is safe.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding WatchedSite table…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WatchedSite" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "siteId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WatchedSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WatchedSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WatchedSite_userId_siteId_key"
    ON "WatchedSite"("userId", "siteId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WatchedSite_userId_idx"
    ON "WatchedSite"("userId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WatchedSite_siteId_idx"
    ON "WatchedSite"("siteId");
  `);

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
