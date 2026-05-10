/**
 * (May 2026 audit #196) Apply CustomerPushSubscription table.
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating CustomerPushSubscription…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CustomerPushSubscription" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "plotId" TEXT NOT NULL,
      "endpoint" TEXT NOT NULL,
      "p256dh" TEXT NOT NULL,
      "auth" TEXT NOT NULL,
      "userAgent" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CustomerPushSubscription_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPushSubscription_endpoint_key" ON "CustomerPushSubscription"("endpoint");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerPushSubscription_plotId_idx" ON "CustomerPushSubscription"("plotId");`);
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
