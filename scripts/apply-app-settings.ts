/**
 * (May 2026 audit #56) Apply AppSettings singleton table + seed
 * the default row. Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating AppSettings…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSettings" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
      "brandName" TEXT NOT NULL DEFAULT 'Sight Manager',
      "logoUrl" TEXT,
      "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
      "supportEmail" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed the default row if missing.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "AppSettings"("id","brandName","primaryColor","updatedAt")
    VALUES ('default','Sight Manager','#2563eb', CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING;
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
